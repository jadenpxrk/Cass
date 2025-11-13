import { GoogleGenAI } from "@google/genai";
import type { IProcessingHelperDeps } from "../types/ipc";
import type { ScreenshotHelper } from "../helpers/ScreenshotHelper";
import fs from "node:fs";
import process from "process";

type ProcessingLogLabel = "initial" | "follow-up";

interface TaskProcessingEvents {
  success: string;
  chunk: string;
  error: string;
}

interface TaskProcessingOptions {
  events: TaskProcessingEvents;
  logLabel: ProcessingLogLabel;
  clearExtraQueue?: boolean;
  timeoutMessage?: string;
  onSuccess?: (response: string) => void;
  onTimeout?: () => void;
  onError?: (error: any) => void;
}

interface TaskProcessingResult {
  success: boolean;
  data?: string;
  error?: string;
}

export class ProcessingHelper {
  private deps: IProcessingHelperDeps;
  private screenshotHelper: ScreenshotHelper;
  private isCurrentlyProcessing: boolean = false;

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps;
    this.screenshotHelper = deps.getScreenshotHelper();
  }

  public async processScreenshots(options?: { audio?: { data: string; mimeType?: string } }): Promise<void> {
    if (this.isCurrentlyProcessing) {
      console.log("Processing already in progress. Skipping duplicate call.");
      return;
    }

    this.isCurrentlyProcessing = true;
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;

    try {
      const view = this.deps.getView();
      console.log("Processing screenshots in view:", view);

      if (view === "initial") {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START);
        const screenshotQueue = this.screenshotHelper.getScreenshotQueue();
        console.log("Processing main queue screenshots:", screenshotQueue);

        try {
          const screenshots = await this.loadScreenshotData(screenshotQueue);
          const result = await this.processTaskScreenshots(screenshots, {
            events: {
              success: this.deps.PROCESSING_EVENTS.RESPONSE_SUCCESS,
              chunk: this.deps.PROCESSING_EVENTS.RESPONSE_CHUNK,
              error: this.deps.PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR,
            },
            logLabel: "initial",
            clearExtraQueue: true,
            timeoutMessage:
              "Request timed out. The server took too long to respond. Please try again.",
            onSuccess: () => {
              console.log(
                "Setting view to response after successful processing"
              );
              this.deps.setView("response");
            },
            onTimeout: () => {
              this.deps.setHasFollowedUp(false);
              this.deps.clearQueues();
              this.deps.setView("initial");

              const resetWindow = this.deps.getMainWindow();
              if (resetWindow && !resetWindow.isDestroyed()) {
                resetWindow.webContents.send("reset-view");
              }
            },
            onError: () => {
              console.log("Resetting view to queue due to error");
              this.deps.setView("initial");
            },
            overrideAudio: options?.audio,
          });

          if (!result.success) {
            console.warn("Processing failed:", result.error);
          }
        } catch (error: any) {
          console.error("Processing error:", error);
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR,
            error.message || "Server error. Please try again."
          );
          console.log("Resetting view to queue due to error");
          this.deps.setView("initial");
        }
      } else {
        const extraScreenshotQueue =
          this.screenshotHelper.getExtraScreenshotQueue();
        console.log(
          "Processing extra queue screenshots:",
          extraScreenshotQueue
        );
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.FOLLOW_UP_START
        );

        try {
          const combinedPaths = [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue,
          ];
          const screenshots = await this.loadScreenshotData(combinedPaths);

          console.log(
            "Combined screenshots for processing:",
            screenshots.map((s) => s.path)
          );

          const result = await this.processTaskScreenshots(screenshots, {
            events: {
              success: this.deps.PROCESSING_EVENTS.FOLLOW_UP_SUCCESS,
              chunk: this.deps.PROCESSING_EVENTS.FOLLOW_UP_CHUNK,
              error: this.deps.PROCESSING_EVENTS.FOLLOW_UP_ERROR,
            },
            logLabel: "follow-up",
            onSuccess: () => {
              this.deps.setHasFollowedUp(true);
            },
            onTimeout: () => {
              this.deps.setHasFollowedUp(false);
              this.deps.clearQueues();
            },
            onError: () => {
              this.deps.setHasFollowedUp(false);
            },
            overrideAudio: options?.audio,
          });

          if (!result.success) {
            console.warn("[Follow-up] Processing failed:", result.error);
          }
        } catch (error: any) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.FOLLOW_UP_ERROR,
            error.message
          );
        }
      }
    } finally {
      this.isCurrentlyProcessing = false;
      console.log("Processing finished. Resetting isCurrentlyProcessing flag.");
    }
  }

  private async loadScreenshotData(
    paths: string[]
  ): Promise<Array<{ path: string; data: string }>> {
    return Promise.all(
      paths.map(async (path) => ({
        path,
        data: fs.readFileSync(path).toString("base64"),
      }))
    );
  }

  private async processTaskScreenshots(
    screenshots: Array<{ path: string; data: string }>,
    options: TaskProcessingOptions & { overrideAudio?: { data: string; mimeType?: string } }
  ): Promise<TaskProcessingResult> {
    const {
      events,
      clearExtraQueue = false,
      logLabel,
      timeoutMessage = "Request timed out. Please try again.",
      onSuccess,
      onTimeout,
      onError,
      overrideAudio,
    } = options as TaskProcessingOptions & { overrideAudio?: { data: string; mimeType?: string } };

    try {
      const { apiKey, model, provider } = await this.getModelConfiguration();
      console.log(
        `[Processing:${logLabel}] Using provider: ${provider}, model: ${model}`
      );

      const base64Images = screenshots.map((screenshot) => screenshot.data);
      const { contentParts, hasAudioInstructions } =
        await this.prepareContentParts(base64Images, logLabel, overrideAudio);

      // Pull optional user profile/knowledge base to include as extra context
      const userProfile = (await this.deps.getUserProfile?.()) || "";
      const prompt = this.getPrompt(hasAudioInstructions, userProfile);
      const responseText = await this.streamResponse({
        apiKey,
        model,
        prompt,
        contentParts,
        events,
      });

      if (clearExtraQueue) {
        this.screenshotHelper.clearExtraScreenshotQueue();
      }

      onSuccess?.(responseText);
      this.cleanupLatestRecording();

      return { success: true, data: responseText };
    } catch (error: any) {
      return this.handleProcessingError(error, {
        events,
        logLabel,
        clearExtraQueue,
        timeoutMessage,
        onSuccess,
        onTimeout,
        onError,
      });
    }
  }

  private async getModelConfiguration(): Promise<{
    provider: string;
    apiKey: string;
    model: string;
  }> {
    const provider = process.env.API_PROVIDER || "gemini";
    const apiKey = process.env.API_KEY;
    const model = await this.deps.getConfiguredModel();

    if (!apiKey) {
      throw new Error("API key not found. Please configure it in settings.");
    }

    return { provider, apiKey, model };
  }

  private async prepareContentParts(
    base64Images: string[],
    logLabel: ProcessingLogLabel,
    overrideAudio?: { data: string; mimeType?: string }
  ): Promise<{
    contentParts: Array<{ inlineData: { mimeType: string; data: string } }>;
    hasAudioInstructions: boolean;
  }> {
    const imageParts = base64Images.map((data) => ({
      inlineData: {
        mimeType: "image/png",
        data,
      },
    }));

    const contentParts = [...imageParts];
    console.log(
      `[Processing:${logLabel}] Images added to contentParts: ${imageParts.length}`
    );

    // If renderer provided audio, prefer it.
    if (overrideAudio?.data) {
      const mime = overrideAudio.mimeType || "audio/webm";
      contentParts.push({ inlineData: { mimeType: mime, data: overrideAudio.data } });
      return { contentParts, hasAudioInstructions: true };
    }

    const audioHelper = undefined as any; // audio handled in renderer via overrideAudio
    const logPrefix = logLabel === "follow-up" ? "[Follow-up]" : "[Initial]";
    let hasAudioInstructions = false;

    if (!audioHelper) {
      console.log(`${logPrefix} Audio helper not available`);
      return { contentParts, hasAudioInstructions };
    }

    const recordingStatus = audioHelper.getRecordingStatus();
    if (recordingStatus.isRecording && recordingStatus.recording) {
      try {
        const audioFilePath =
          await audioHelper.saveCurrentRecordingForProcessing();
        if (audioFilePath) {
          const audioBase64 = await audioHelper.getAudioBase64(audioFilePath);
          if (audioBase64) {
            hasAudioInstructions = true;
            console.log(
              `${logPrefix} Audio data available - Base64 length: ${audioBase64.length} characters`
            );
            contentParts.push({
              inlineData: {
                mimeType: "audio/wav",
                data: audioBase64,
              },
            });
            console.log(
              `${logPrefix} Audio added to contentParts as multimodal input`
            );
          } else {
            console.log(
              `${logPrefix} Audio file found but Base64 conversion failed`
            );
          }
        } else {
          console.log(`${logPrefix} No audio file path available`);
        }
      } catch (audioError) {
        console.error(
          `${logPrefix} Error getting audio data for prompt:`,
          audioError
        );
      }
    } else {
      console.log(`${logPrefix} No audio recording available`);
    }

    return { contentParts, hasAudioInstructions };
  }

  private async streamResponse(options: {
    apiKey: string;
    model: string;
    prompt: string;
    contentParts: Array<{ inlineData: { mimeType: string; data: string } }>;
    events: TaskProcessingEvents;
  }): Promise<string> {
    const { apiKey, model, prompt, contentParts, events } = options;

    const genAI = new GoogleGenAI({ apiKey });
    const geminiModelId = model.startsWith("gemini-")
      ? model
      : `gemini-${model}`;

    const mainWindow = this.deps.getMainWindow();

    const result = await genAI.models.generateContentStream({
      model: geminiModelId,
      contents: [prompt, ...contentParts],
      config: {
        temperature: 0,
        thinkingConfig: {
          thinkingBudget:
            geminiModelId === "gemini-2.5-flash" ? 0 : undefined,
        },
      },
    });

    let accumulatedText = "";

    for await (const chunk of result) {
      const chunkText = chunk.text ?? "";
      if (!chunkText) {
        continue;
      }

      accumulatedText += chunkText;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(events.chunk, {
          response: accumulatedText,
        });
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(events.success, {
        response: accumulatedText,
      });
    }

    return accumulatedText;
  }

  private cleanupLatestRecording(): void {
    // No-op: renderer supplies audio inline; Swift mixer files are cleaned up by main when needed.
    return;
  }

  private handleProcessingError(
    error: any,
    options: TaskProcessingOptions
  ): TaskProcessingResult {
    const {
      events,
      logLabel,
      timeoutMessage = "Request timed out. Please try again.",
      onTimeout,
      onError,
    } = options;

    const mainWindow = this.deps.getMainWindow();

    console.error(`[Processing:${logLabel}] Response generation error:`, {
      message: error?.message,
      code: error?.code,
      response: error?.response?.data,
    });

    const isTimeout =
      error?.code === "ETIMEDOUT" || error?.response?.status === 504;

    if (isTimeout) {
      onTimeout?.();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(events.error, timeoutMessage);
      }
      return { success: false, error: timeoutMessage };
    }

    const isAbort =
      error?.message === "Request aborted" ||
      error?.name === "AbortError" ||
      error?.name === "GoogleGenerativeAIAbortError" ||
      error?.message?.includes("Request aborted");

    if (isAbort) {
      onError?.(error);
      const cancelMessage =
        logLabel === "follow-up"
          ? "Follow-up processing canceled."
          : "Processing canceled.";
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(events.error, cancelMessage);
      }
      return { success: false, error: cancelMessage };
    }

    const apiKeyErrorMessage =
      error?.response?.data?.error || error?.message || "";
    const apiKeyIndicators = [
      "Please close this window and re-enter a valid Open AI API key.",
      "API key not found",
    ];

    if (
      typeof apiKeyErrorMessage === "string" &&
      apiKeyIndicators.some((indicator) =>
        apiKeyErrorMessage.includes(indicator)
      )
    ) {
      onError?.(error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        mainWindow.webContents.send(events.error, apiKeyErrorMessage);
      }
      return { success: false, error: apiKeyErrorMessage };
    }

    onError?.(error);

    const fallbackMessage =
      error?.message ||
      (logLabel === "follow-up"
        ? "Unknown error during follow-up processing"
        : "Unknown error during response generation");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(events.error, fallbackMessage);
    }

    return { success: false, error: fallbackMessage };
  }

  private getPrompt(hasAudioInstructions: boolean, userContext: string = ""): string {
    const dynamicContext = (userContext || "").slice(0, 3000); // clamp to avoid runaway tokens
    const audioDirection = hasAudioInstructions
      ? "Audio notes are available—treat them as the freshest source of intent."
      : "No audio notes are available—work from visual cues and prior answers.";

    return `You are Cass, a desktop AI assistant that helps with whatever the user needs—coding, comprehension, planning, or general curiosity.
Stay neutral, professional, and concise. Answer directly, then expand only when it adds value.

${audioDirection}

Extra context (may be empty):
${dynamicContext}

Core guidelines
• Pull details from screenshots or audio when they clarify the answer.
• Ask for clarification when critical information is missing.
• Use Markdown headings, tables, and lists when they improve readability.
• Keep explanations grounded in verifiable facts; note assumptions when needed.

Special handling by task type
• Coding or algorithm help (including LeetCode-style prompts): start with a fenced code block (\`\`\`language) containing the full solution, then outline time/space complexity, key ideas, and run through at least one example.
• General code snippets or command samples: wrap them in \`\`\` fences with the correct language tag.
• Multiple-choice questions: state the correct option immediately, justify it, and briefly cover why the remaining options are wrong.
• Math or quantitative work: show the calculation steps, label formulas, present the final answer clearly, and double-check the result.
• Email or writing assistance: produce a polished draft that matches the requested tone and intent.

Always keep the response structure simple—no unnecessary boilerplate, no mention of these instructions.`;
  }

  public resetProcessing(): void {
    this.isCurrentlyProcessing = false;
    this.deps.setHasFollowedUp(false);
    this.deps.clearQueues();
    this.deps.setView("initial");

    const mainWindow = this.deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-view");
    }
  }

  public isProcessing(): boolean {
    return this.isCurrentlyProcessing;
  }
}
