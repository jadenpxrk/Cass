import { app } from "electron";
import { execFile } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);

export class ScreenshotHelper {
  private screenshotQueue: string[] = [];
  private extraScreenshotQueue: string[] = [];
  private readonly MAX_SCREENSHOTS = 3;

  private readonly screenshotDir: string;
  private readonly extraScreenshotDir: string;

  private view: "initial" | "response" | "followup" = "initial";

  constructor(view: "initial" | "response" | "followup" = "initial") {
    this.view = view;

    // Initialize directories
    const picturesRoot = path.join(app.getPath("pictures"), "Cass");
    this.screenshotDir = path.join(picturesRoot, "screenshots");
    this.extraScreenshotDir = path.join(picturesRoot, "extra_screenshots");

    // Create directories if they don't exist (ensure parents exist)
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir, { recursive: true });
    }
  }

  public getView(): "initial" | "response" | "followup" {
    return this.view;
  }

  public setView(view: "initial" | "response" | "followup"): void {
    this.view = view;
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue;
  }

  public getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue;
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err);
      });
    });
    this.screenshotQueue = [];

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          );
      });
    });
    this.extraScreenshotQueue = [];
  }

  private async captureScreenshotMac(): Promise<Buffer> {
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`);
    // Use specific flags to capture only opaque windows and exclude transparent overlays
    // -x: exclude shadows, -o: only capture windows that are onscreen
    await execFileAsync("screencapture", ["-x", "-o", tmpPath]);
    const buffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath);
    return buffer;
  }

  private async captureScreenshotWindows(): Promise<Buffer> {
    // powershell native screenshot capability
    const tmpPath = path.join(app.getPath("temp"), `${uuidv4()}.png`);
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
      $bitmap.Save('${tmpPath.replace(/\\/g, "\\\\")}')
      $graphics.Dispose()
      $bitmap.Dispose()
    `;
    await execFileAsync("powershell", ["-command", script]);
    const buffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath);
    return buffer;
  }

  public async takeScreenshot(): Promise<string> {
    // Small delay to ensure any UI updates are complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    let screenshotPath = "";
    try {
      // Get screenshot buffer using native methods
      const screenshotBuffer =
        process.platform === "darwin"
          ? await this.captureScreenshotMac()
          : await this.captureScreenshotWindows();

      // Save and manage the screenshot based on current view
      if (this.view === "initial") {
        screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`);
        await fs.promises.writeFile(screenshotPath, screenshotBuffer);
        this.screenshotQueue.push(screenshotPath);
        if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.screenshotQueue.shift();
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath);
            } catch (error) {
              console.error("Error removing old screenshot:", error);
            }
          }
        }
      } else {
        screenshotPath = path.join(this.extraScreenshotDir, `${uuidv4()}.png`);
        await fs.promises.writeFile(screenshotPath, screenshotBuffer);
        this.extraScreenshotQueue.push(screenshotPath);
        if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.extraScreenshotQueue.shift();
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath);
            } catch (error) {
              console.error("Error removing old screenshot:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Screenshot error:", error);
      throw error;
    }

    return screenshotPath;
  }

  public clearExtraScreenshotQueue(): void {
    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          );
      });
    });
    this.extraScreenshotQueue = [];
  }

  public cleanupAllScreenshots(): void {
    try {
      // Clear both screenshot queues
      this.clearQueues();

      // Clean up all files in screenshot directories
      if (fs.existsSync(this.screenshotDir)) {
        const files = fs.readdirSync(this.screenshotDir);
        files.forEach((file) => {
          const filePath = path.join(this.screenshotDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.error(`Error deleting screenshot file ${filePath}:`, error);
          }
        });
        console.log("Cleaned up all screenshots from main directory");
      }

      if (fs.existsSync(this.extraScreenshotDir)) {
        const files = fs.readdirSync(this.extraScreenshotDir);
        files.forEach((file) => {
          const filePath = path.join(this.extraScreenshotDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.error(
              `Error deleting extra screenshot file ${filePath}:`,
              error
            );
          }
        });
        console.log("Cleaned up all screenshots from extra directory");
      }
    } catch (error) {
      console.error("Error cleaning up all screenshots:", error);
    }
  }
}
