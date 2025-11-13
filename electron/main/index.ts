import { BrowserWindow, app, screen } from "electron";
// Initialize local loopback (system audio via getDisplayMedia)
import { initMain as initLoopbackMain } from "../loopback/main";
initLoopbackMain();
import path from "path";

import { ProcessingHelper } from "../services/ProcessingHelper";
// import { ScreenCaptureHelper } from "../helpers/ScreenCaptureHelper";
import { ScreenshotHelper } from "../helpers/ScreenshotHelper";
import { ShortcutsHelper } from "../helpers/shortcuts";
import { initializeIpcHandlers } from "../ipc";
import { getStoreValue } from "../store/config";
import type { IProcessingHelperDeps, IShortcutsHelperDeps, ProcessingEventMap } from "../types/ipc";

interface State {
  mainWindow: BrowserWindow | null;
  isWindowVisible: boolean;
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  currentX: number;
  currentY: number;
  shortcutsHelper: any;
  hasFollowedUp: boolean;
  PROCESSING_EVENTS: ProcessingEventMap;
  screenshotHelper: any;
  processingHelper: any;
  
  view: "initial" | "response" | "followup";
  step: number;
}

const state: State = {
  mainWindow: null,
  isWindowVisible: false,
  windowPosition: null,
  windowSize: null,
  screenWidth: 0,
  screenHeight: 0,
  currentX: 0,
  currentY: 0,
  shortcutsHelper: null,
  hasFollowedUp: false,
  screenshotHelper: null,
  processingHelper: null,
  
  view: "initial",
  step: 0,
  PROCESSING_EVENTS: {
    API_KEY_INVALID: "processing-api-key-invalid",
    INITIAL_START: "initial-start",
    RESPONSE_SUCCESS: "response-success",
    INITIAL_RESPONSE_ERROR: "response-error",
    FOLLOW_UP_START: "follow-up-start",
    FOLLOW_UP_SUCCESS: "follow-up-success",
    FOLLOW_UP_ERROR: "follow-up-error",
    FOLLOW_UP_CHUNK: "follow-up-chunk",
    RESPONSE_CHUNK: "response-chunk",
    RESET: "reset",
  },
};



function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view);
  
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    setHasFollowedUp,
    getHasFollowedUp,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS,
    getConfiguredModel,
    getUserProfile: async () => {
      try {
        const value = await getStoreValue("user-profile");
        if (typeof value === "string") return value;
        if (value && typeof value === "object") return JSON.stringify(value);
        return undefined;
      } catch {
        return undefined;
      }
    },
  } as IProcessingHelperDeps);

  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    takeScreenshot,
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isWindowUsable,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) =>
        Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
      ),
    moveWindowRight: () =>
      moveWindowHorizontal((x) =>
        Math.min(
          state.screenWidth - (state.windowSize?.width || 0) / 2,
          x + state.step
        )
      ),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step),
    quitApplication,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS,
    setHasFollowedUp,
    getHasFollowedUp,
    getConfiguredModel,
  } as IShortcutsHelperDeps);
}

async function createWindow(): Promise<BrowserWindow> {
  if (state.mainWindow) {
    return state.mainWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;
  state.screenWidth = workArea.width;
  state.screenHeight = workArea.height;
  state.step = 60;
  state.currentY = 50;

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    height: 600,
    width: 800,
    x: state.currentX,
    y: 50,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      scrollBounce: true,
    },
    show: true,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    type: process.platform === "darwin" ? "panel" : "toolbar", // Use different types for better screenshot exclusion
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: true,
    movable: true,
  };

  state.mainWindow = new BrowserWindow(windowSettings);

  // No main-side audio helper; renderer handles audio capture

  // Ensure window starts non-interactive (click-through) immediately
  state.mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading");
    // Re-enable click-through after load
    state.mainWindow?.setIgnoreMouseEvents(true, { forward: true });
  });

  state.mainWindow.webContents.on("did-start-loading", () => {
    // Ensure click-through during loading
    state.mainWindow?.setIgnoreMouseEvents(true, { forward: true });
  });

  state.mainWindow.on("show", () => {
    // Ensure click-through when window is shown
    state.mainWindow?.setIgnoreMouseEvents(true, { forward: true });
  });

  state.mainWindow.on("ready-to-show", () => {
    // Ensure click-through when window is ready
    state.mainWindow?.setIgnoreMouseEvents(true, { forward: true });
  });

  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription);
      // Always try to load the built files on failure
      console.log("Attempting to load built files...");
      setTimeout(() => {
        state.mainWindow
          ?.loadFile(path.join(__dirname, "../dist/index.html"))
          .catch((error) => {
            console.error("Failed to load built files on retry:", error);
          });
      }, 1000);
    }
  );

  // Load the app - always load from built files
  console.log("Loading application from built files...");
  if (app.isPackaged) {
    state.mainWindow.loadFile(path.join(__dirname, "../index.html"));
  } else {
    state.mainWindow.loadURL("http://localhost:54321");
  }

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1);

  // if (isDev) {
  //   state.mainWindow.webContents.openDevTools();
  // }

  // Screen capture protection disabled (no ScreenFilter)

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  state.mainWindow.setAlwaysOnTop(true, "floating", 1);

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Configure window to be excluded from screenshots while remaining visible
    state.mainWindow.setHiddenInMissionControl(true);
    state.mainWindow.setWindowButtonVisibility(false);
    state.mainWindow.setBackgroundColor("#00000000");

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true);

    // Disable window shadow - this is key for screenshot exclusion
    state.mainWindow.setHasShadow(false);

    // Set the window level to be above screenshots but not always on top of everything
    // Using 'floating' level which is typically excluded from system screenshots
    state.mainWindow.setAlwaysOnTop(true, "floating");
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(true);
  state.mainWindow.webContents.setFrameRate(30);

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove);
  state.mainWindow.on("resize", handleWindowResize);
  state.mainWindow.on("closed", handleWindowClosed);

  // Initialize window state
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
  state.windowSize = { width: bounds.width, height: bounds.height };
  state.currentX = bounds.x;
  state.currentY = bounds.y;
  state.isWindowVisible = true;

  // Screen capture protection disabled
  // if (process.platform === "darwin") {
  //   if (!state.screenCaptureHelper) {
  //     console.error("ScreenCaptureHelper not initialized. Application requires screen capture protection on macOS.");
  //     const { dialog } = require('electron');
  //     dialog.showErrorBox(
  //       'Cass - Screen Protection Required',
  //       'Screen capture protection could not be initialized. This feature is required for Cass to remain undetectable during screen sharing.\n\nPlease ensure you have granted Screen Recording permissions to Cass in System Preferences > Security & Privacy > Privacy > Screen Recording.'
  //     );
  //     app.quit();
  //     return state.mainWindow;
  //   }
  //
  //   try {
  //     const success = await state.screenCaptureHelper.startScreenCaptureProtection(state.mainWindow);
  //     if (!success) {
  //       console.error("Failed to start screen capture protection. This is required for undetectable operation.");
  //       const { dialog } = require('electron');
  //       dialog.showErrorBox(
  //         'Cass - Screen Protection Failed',
  //         'Screen capture protection failed to start. This feature is required for Cass to remain undetectable during screen sharing.\n\nPlease ensure you have granted Screen Recording permissions to Cass in System Preferences > Security & Privacy > Privacy > Screen Recording.'
  //       );
  //       app.quit();
  //       return state.mainWindow;
  //     }
  //     console.log("ScreenCaptureKit protection enabled successfully");
  //   } catch (error) {
  //     console.error("Error starting ScreenCaptureKit protection:", error);
  //     console.error("Screen capture protection is required for this application to work properly.");
  //     const { dialog } = require('electron');
  //     dialog.showErrorBox(
  //       'Cass - Screen Protection Error',
  //       `Screen capture protection encountered an error: ${error}\n\nThis feature is required for Cass to remain undetectable during screen sharing.\n\nPlease ensure:\n1. You have granted Screen Recording permissions to Cass\n2. You are running macOS 12.3 or later`
  //     );
  //     app.quit();
  //     return state.mainWindow;
  //   }
  // } else {
  //   console.warn("Screen capture protection is only available on macOS. Some features may not work as expected.");
  // }

  return state.mainWindow;
}

function handleWindowMove(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
  state.currentX = bounds.x;
  state.currentY = bounds.y;
}

function handleWindowResize(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowSize = { width: bounds.width, height: bounds.height };
}

function handleWindowClosed(): void {
  state.mainWindow = null;
  state.isWindowVisible = false;
  state.windowPosition = null;
  state.windowSize = null;
}

// Window visibility functions
function hideMainWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    const bounds = state.mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y };
    state.windowSize = { width: bounds.width, height: bounds.height };
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    state.mainWindow.setOpacity(0);
    state.mainWindow.hide();
    state.isWindowVisible = false;
  }
}

function showMainWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (state.windowPosition && state.windowSize) {
      state.mainWindow.setBounds({
        ...state.windowPosition,
        ...state.windowSize,
      });
    }
    // Ensure window starts non-interactive (click-through)
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    state.mainWindow.setAlwaysOnTop(true, "floating");
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    state.mainWindow.setContentProtection(true);
    state.mainWindow.setOpacity(0);

    // Use showInactive on macOS to prevent focus stealing
    if (process.platform === "darwin") {
      state.mainWindow.showInactive();
    } else {
      state.mainWindow.show();
    }

    state.mainWindow.setOpacity(1);
    state.isWindowVisible = true;
  }
}

function isWindowUsable(): boolean {
  return (
    state.isWindowVisible &&
    state.mainWindow?.isVisible() === true &&
    (state.mainWindow?.getOpacity() ?? 0) > 0
  );
}

function toggleMainWindow(): void {
  state.isWindowVisible ? hideMainWindow() : showMainWindow();
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  if (!state.mainWindow) return;
  state.currentX = updateFn(state.currentX);
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  );
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  if (!state.mainWindow) return;

  const newY = updateFn(state.currentY);
  // Allow window to go 2/3 off screen in either direction
  const maxUpLimit = (-(state.windowSize?.height || 0) * 2) / 3;
  const maxDownLimit =
    state.screenHeight + ((state.windowSize?.height || 0) * 2) / 3;

  // Only update if within bounds
  if (newY >= maxUpLimit && newY <= maxDownLimit) {
    state.currentY = newY;
    state.mainWindow.setPosition(
      Math.round(state.currentX),
      Math.round(state.currentY)
    );
  }
}

// Application control functions
function quitApplication(): void {
  console.log("Quit application requested via shortcut");
  app.quit();
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    const [currentX, currentY] = state.mainWindow.getPosition();
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const maxWidth = Math.floor(workArea.width * 0.5);

    state.mainWindow.setBounds({
      x: Math.min(currentX, workArea.width - maxWidth),
      y: currentY,
      width: Math.min(width + 32, maxWidth),
      height: Math.ceil(height),
    });
  }
}

// Environment setup
async function loadEnvVariables() {
  try {
    // No longer using dotenv for API key
    // Instead, check if we have a stored API key in our config file
    // Read config using the new store functions
    const storedApiKey = await getStoreValue("api-key");
    const storedModel =
      (await getStoreValue("api-model")) || "gemini-2.5-flash"; // Default model

    if (storedApiKey && storedModel) {
      // Set generic environment variables
      process.env.API_PROVIDER = "gemini"; // Always use gemini
      process.env.API_KEY = storedApiKey;
      process.env.API_MODEL = storedModel;

      console.log(
        `API configuration loaded: Provider=gemini, Model=${storedModel}`
      );
    } else {
      console.log(
        "No API key found in user preferences. User will be prompted to enter one."
      );

      // Since we're going to prompt the user for the API key, we can set up a one-time
      // check to notify the renderer that the API key is missing
      const checkForApiKey = () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send("api-key-missing");
        }
      };

      // Check after a short delay to ensure the window is ready
      setTimeout(checkForApiKey, 1000);
    }

    console.log("Environment setup complete:", {
      API_PROVIDER: process.env.API_PROVIDER,
      API_KEY: process.env.API_KEY ? "exists" : "missing",
      API_MODEL: process.env.API_MODEL,
    });
  } catch (error) {
    console.error("Error loading environment variables:", error);
  }
}

// Initialize application
async function initializeApp() {
  try {
    await loadEnvVariables();
    initializeHelpers();
    initializeIpcHandlers({
      getMainWindow: () => state.mainWindow,
      setWindowDimensions,
      getScreenshotQueue: () =>
        state.screenshotHelper?.getScreenshotQueue() || [],
      getExtraScreenshotQueue: () =>
        state.screenshotHelper?.getExtraScreenshotQueue() || [],
      processingHelper: state.processingHelper,
      takeScreenshot: async () => {
        if (!state.screenshotHelper) return "";
        const screenshot = await state.screenshotHelper.takeScreenshot();
        return screenshot;
      },
      toggleMainWindow,
      clearQueues: () => state.screenshotHelper?.clearQueues() || {},
      setView: (view) => state.screenshotHelper?.setView(view) || {},
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      quitApplication,
      getView: () => state.screenshotHelper?.getView() || "initial",
      createWindow: async () => {
        if (!state.mainWindow) {
          return await createWindow();
        }
        return state.mainWindow;
      },
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      setHasFollowedUp: (value) => {
        state.hasFollowedUp = value;
      },
      
    });
    await createWindow();
    state.shortcutsHelper?.registerGlobalShortcuts();
  } catch (error) {
    console.error("Failed to initialize application:", error);
    app.quit();
  }
}

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow;
}

function getView(): "initial" | "response" | "followup" {
  return state.view;
}

function setView(view: "initial" | "response" | "followup"): void {
  state.view = view;
  state.screenshotHelper?.setView(view);
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper;
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || [];
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || [];
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues();
  setView("initial");
}

function cleanupAllFiles(): void {
  if (state.screenshotHelper) {
    state.screenshotHelper.cleanupAllScreenshots();
    console.log("All screenshots cleaned up via cleanup function");
  }

  
}

async function takeScreenshot(): Promise<string> {
  if (!state.mainWindow) throw new Error("No main window available");
  return state.screenshotHelper?.takeScreenshot() || "";
}

function setHasFollowedUp(value: boolean): void {
  state.hasFollowedUp = value;
}

function getHasFollowedUp(): boolean {
  return state.hasFollowedUp;
}

// Function to get the configured model from the store
async function getConfiguredModel(): Promise<string> {
  try {
    // Use the exported getter
    const model = (await getStoreValue("api-model")) || "gemini-2.5-flash";
    return model;
  } catch (error) {
    console.error("Error getting configured model from store:", error);
    return "gemini-2.5-flash"; // Return default on error
  }
}


// Export state and functions for other modules
export {
  state,
  createWindow,
  hideMainWindow,
  showMainWindow,
  toggleMainWindow,
  setWindowDimensions,
  moveWindowHorizontal,
  moveWindowVertical,
  getMainWindow,
  getView,
  setView,
  getScreenshotHelper,
  getScreenshotQueue,
  getExtraScreenshotQueue,
  clearQueues,
  cleanupAllFiles,
  takeScreenshot,
  setHasFollowedUp,
  getHasFollowedUp,
  getConfiguredModel,
  isWindowUsable,
};

app.whenReady().then(initializeApp);

// Handle app events for proper cleanup
app.on("before-quit", async () => {
  console.log(
    "App is about to quit, cleaning up screenshots, and audio recordings..."
  );
  // if (state.screenCaptureHelper) {
  //   await state.screenCaptureHelper.stopScreenCaptureProtection();
  // }

  if (state.screenshotHelper) {
    state.screenshotHelper.cleanupAllScreenshots();
    console.log("All screenshots cleaned up");
  }

  // Renderer handles audio; no main-side cleanup required
});

app.on("window-all-closed", async () => {
  // Clean up screen capture protection (disabled)
  // if (state.screenCaptureHelper) {
  //   await state.screenCaptureHelper.stopScreenCaptureProtection();
  // }

  if (state.screenshotHelper) {
    state.screenshotHelper.cleanupAllScreenshots();
    console.log("All screenshots cleaned up on window close");
  }

  // Renderer handles audio; no main-side cleanup required

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error("Failed to create window on activate:", error);
      app.quit();
    });
  }
});
