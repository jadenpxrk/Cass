import { useEffect, useRef, useState } from "react";

import Commands from "@/components/Commands";
import FollowUp from "@/components/FollowUp";
import { MarkdownSection } from "@/components/shared/MarkdownSection";
import { Screenshot } from "@/types";
import { fetchScreenshots } from "@/utils/screenshots";
import { useQueryClient } from "@tanstack/react-query";

interface TaskResponseData {
  response: string;
  isFollowUp?: boolean;
}

export interface ResponseProps {
  setView: (view: "initial" | "response" | "followup") => void;
}

export default function Response({ setView }: ResponseProps) {
  const queryClient = useQueryClient();
  const [showFollowUpView, setShowFollowUpView] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [followUpProcessing, setFollowUpProcessing] = useState(false);
  const [responseData, setResponseData] = useState<string | null>(null);
  const [streamedResponse, setStreamedResponse] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([]);

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight;
        const contentWidth = contentRef.current.scrollWidth;
        if (isTooltipVisible) {
          contentHeight += tooltipHeight;
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    updateDimensions();

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const screenshots = await fetchScreenshots();
          setExtraScreenshots(screenshots);
        } catch (error) {
          console.error("Error loading extra screenshots:", error);
        }
      }),
      window.electronAPI.onResetView(() => {
        setIsResetting(true);
        queryClient.removeQueries({ queryKey: ["task_response"] });
        queryClient.removeQueries({ queryKey: ["new_response"] });
        setExtraScreenshots([]);
        setShowFollowUpView(false);
        setFollowUpProcessing(false);
        setResponseData(null);
        setStreamedResponse("");
        setIsStreaming(false);
        setTimeout(() => setIsResetting(false), 0);
      }),
      window.electronAPI.onResponseStart(() => {
        setResponseData(null);
        setStreamedResponse("");
        setIsStreaming(false);
      }),
      window.electronAPI.onResponseError((error: string) => {
        const cachedResponse = queryClient.getQueryData<TaskResponseData>([
          "task_response",
        ]);
        if (!cachedResponse) {
          setView("initial");
        }
        setResponseData(cachedResponse?.response || null);
        setIsStreaming(false);
        console.error("Processing error:", error);
      }),
      window.electronAPI.onResponseSuccess((rawData: any) => {
        const responseText =
          typeof rawData === "string" ? rawData : rawData?.response || "";

        // Handle empty initial response which signals the start of streaming
        if (!responseText && !isStreaming) {
          setIsStreaming(true);
          setStreamedResponse("");
          return;
        }

        // If we were streaming, we've now received the complete response
        if (isStreaming) {
          setIsStreaming(false);
          // Set the response with the final streamed content
          setResponseData(streamedResponse || responseText);
        } else {
          // Direct response without streaming
          setResponseData(responseText);
        }

        if (!responseText && !streamedResponse) {
          console.warn("Received empty response data");
          return;
        }

        console.log("Received response:", responseText || streamedResponse);

        const taskResponseData = {
          response: responseText || streamedResponse,
        };
        queryClient.setQueryData(["task_response"], taskResponseData);

        (async () => {
          try {
            const screenshots = await fetchScreenshots();
            setExtraScreenshots(screenshots);
          } catch (error) {
            console.error("Error loading extra screenshots:", error);
            setExtraScreenshots([]);
          }
        })();
      }),
      window.electronAPI.onResponseChunk((data: { response: string }) => {
        setStreamedResponse(data.response);
        setIsStreaming(true);
      }),
      window.electronAPI.onFollowUpStart(() => {
        console.log("[Response] Follow up process starting");
        setFollowUpProcessing(true);
        setShowFollowUpView(true);
        queryClient.setQueryData(["followup_response"], null);
      }),
      window.electronAPI.onFollowUpSuccess((data: TaskResponseData) => {
        console.log("[Response] Follow up success received");
        queryClient.setQueryData(["followup_response"], data);
        setFollowUpProcessing(false);

        // Also update the main response data with the follow-up response
        queryClient.setQueryData(["task_response"], {
          ...data,
          isFollowUp: true,
        });
        setResponseData(data.response);

        // Switch back to response view to show the response
        setShowFollowUpView(false);
      }),
      window.electronAPI.onFollowUpError((error: string) => {
        console.error("[Response] Follow up error:", error);
        setFollowUpProcessing(false);
        setShowFollowUpView(false);
      }),
    ];

    return () => {
      resizeObserver.disconnect();
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [
    isTooltipVisible,
    tooltipHeight,
    queryClient,
    setView,
    streamedResponse,
    isStreaming,
  ]);

  useEffect(() => {
    const cachedResponse = queryClient.getQueryData<TaskResponseData>([
      "task_response",
    ]);
    setResponseData(cachedResponse?.response || null);

    const unsubscribe = queryClient.getQueryCache().subscribe((event: any) => {
      if (event?.query.queryKey[0] === "task_response") {
        const response = queryClient.getQueryData<TaskResponseData>([
          "task_response",
        ]);
        setResponseData(response?.response ?? null);
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible);
    setTooltipHeight(height);
  };

  // Determine what content to display - either the completed response or streamed content
  const displayContent = isStreaming ? streamedResponse : responseData;

  const isLoading = !displayContent && !isStreaming;

  return (
    <>
      {!isResetting && showFollowUpView ? (
        <FollowUp
          isProcessing={followUpProcessing}
          setIsProcessing={setFollowUpProcessing}
        />
      ) : (
        <div ref={contentRef} className="relative space-y-3 px-4 py-3">
          <div className="relative z-10">
            <Commands
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              view="response"
              isLoading={isLoading}
              screenshots={extraScreenshots}
            />
          </div>

          <div className="w-full text-xs text-foreground rounded-md select-none bg-background/50 backdrop-blur-md">
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                <MarkdownSection
                  content={displayContent}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
