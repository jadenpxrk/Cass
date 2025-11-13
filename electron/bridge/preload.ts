
import { contextBridge, ipcRenderer } from "electron";

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number;
    height: number;
  }) => Promise<void>;
  // process
  getScreenshots: () => Promise<{
    success: boolean;
    previews?: Array<{ path: string; preview: string }> | null;
    error?: string;
  }>;
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  onResetView: (callback: () => void) => () => void;
  onResponseStart: (callback: () => void) => () => void;
  onFollowUpStart: (callback: () => void) => () => void;
  onFollowUpSuccess: (callback: (data: any) => void) => () => void;
  onFollowUpError: (callback: (error: string) => void) => () => void;
  onFollowUpChunk: (
    callback: (data: { response: string }) => void
  ) => () => void;
  onResponseError: (callback: (error: string) => void) => () => void;
  onResponseSuccess: (callback: (data: any) => void) => () => void;
  onResponseChunk: (
    callback: (data: { response: string }) => void
  ) => () => void;
  // shortcuts
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>;
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>;
  triggerReset: () => Promise<{ success: boolean; error?: string }>;
  cancelProcessing: () => Promise<{ success: boolean; error?: string }>;
  // movement
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>;
  // helper
  getPlatform: () => string;
  setApiConfig: (config: {
    apiKey: string;
    model: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getApiConfig: () => Promise<{
    success: boolean;
    apiKey?: string;
    model?: string;
    provider?: string;
    error?: string;
  }>;
  // User profile (personalization/knowledge base)
  getUserProfile: () => Promise<{ success: boolean; profile?: string; error?: string }>;
  setUserProfile: (
    profile: string | Record<string, any>
  ) => Promise<{ success: boolean; error?: string }>;
  onApiKeyUpdated: (callback: () => void) => () => void;
  onApiKeyMissing: (callback: () => void) => () => void;
  setIgnoreMouseEvents: () => Promise<{ success: boolean; error?: string }>;
  setInteractiveMouseEvents: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  // Audio recording
  startAudioRecording: () => Promise<{ success: boolean; error?: string }>;
  stopAudioRecording: () => Promise<{
    success: boolean;
    recording?: any;
    error?: string;
  }>;
  getAudioRecordingStatus: () => Promise<{
    success: boolean;
    isRecording: boolean;
    recording?: any;
    error?: string;
  }>;
  getAudioBase64: (filePath: string) => Promise<{
    success: boolean;
    audioBase64?: string;
    error?: string;
  }>;
  quitApplication: () => Promise<{ success: boolean; error?: string }>;
  // System audio loopback (electron-audio-loopback)
  enableLoopbackAudio: () => Promise<any>;
  disableLoopbackAudio: () => Promise<any>;
}

export const PROCESSING_EVENTS = {
  // states for generating the initial solution
  INITIAL_START: "initial-start",
  RESPONSE_SUCCESS: "response-success",
  INITIAL_RESPONSE_ERROR: "response-error",
  RESET: "reset",
  RESPONSE_CHUNK: "response-chunk",

  // states for processing the debugging
  FOLLOW_UP_START: "follow-up-start",
  FOLLOW_UP_SUCCESS: "follow-up-success",
  FOLLOW_UP_ERROR: "follow-up-error",
  FOLLOW_UP_CHUNK: "follow-up-chunk",
} as const;


// Simple local event bus for renderer-facing events
type AudioStatus = { isRecording: boolean; recording?: any };
const audioListeners = new Set<(data: AudioStatus) => void>();
function emitAudioStatus(data: AudioStatus) {
  audioListeners.forEach((cb) => {
    try { cb(data); } catch {}
  });
}

// In-renderer recording state
let rec = {
  isRecording: false,
  startTime: 0,
  mode: "idle" as "mixed" | "system-only" | "microphone-only" | "idle",
  mediaRecorder: null as any,
  audioContext: null as any,
  destination: null as any,
  sysStream: null as any,
  micStream: null as any,
  chunks: [] as any[],
  lastBlob: null as any,
  lastBase64: "",
  lastMime: "audio/webm",
};

async function startRendererRecording() {
  if (rec.isRecording) return { success: false, error: "Already recording" };
  try {
    // Enable loopback if available; ignore errors
    try { await ipcRenderer.invoke("enable-loopback-audio"); } catch {}

    const sys = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
    // Remove video track(s)
    sys.getVideoTracks().forEach((t: MediaStreamTrack) => { try { t.stop(); } catch {} sys.removeTrack(t); });
    // Disable loopback override so normal getDisplayMedia works later
    try { await ipcRenderer.invoke("disable-loopback-audio"); } catch {}

    let mic: MediaStream | null = null;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}

    const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const sysSource = ctx.createMediaStreamSource(sys);
    sysSource.connect(dest);
    let modeStr: any = "system-only";
    if (mic) {
      const micSource = ctx.createMediaStreamSource(mic);
      micSource.connect(dest);
      modeStr = "mixed";
    }

    const mr = new (window as any).MediaRecorder(dest.stream);
    rec.isRecording = true;
    rec.startTime = Date.now();
    rec.mode = modeStr;
    rec.mediaRecorder = mr;
    rec.audioContext = ctx;
    rec.destination = dest;
    rec.sysStream = sys;
    rec.micStream = mic;
    rec.chunks = [];
    rec.lastBlob = null;
    rec.lastBase64 = "";
    rec.lastMime = mr.mimeType || "audio/webm";

    mr.ondataavailable = (e: any) => {
      if (e.data && e.data.size > 0) rec.chunks.push(e.data);
    };
    mr.start(500);

    emitAudioStatus({ isRecording: true, recording: { startTime: rec.startTime, recordingMode: rec.mode } });
    return { success: true };
  } catch (e: any) {
    rec.isRecording = false;
    emitAudioStatus({ isRecording: false });
    return { success: false, error: e?.message || String(e) };
  }
}

async function stopRendererRecording() {
  if (!rec.isRecording) return { success: false, error: "No recording" };
  try {
    await new Promise<void>((resolve) => {
      const mr = rec.mediaRecorder!;
      const onStop = () => { mr.removeEventListener("stop", onStop as any); resolve(); };
      mr.addEventListener("stop", onStop as any);
      try { mr.stop(); } catch { resolve(); }
    });
  const blob = new (window as any).Blob(rec.chunks, { type: rec.lastMime });
  rec.lastBlob = blob;
  rec.lastBase64 = await blobToBase64(blob);
  } catch {}
  try { rec.sysStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { rec.micStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { rec.audioContext?.close(); } catch {}
  const recording = { startTime: rec.startTime, recordingMode: rec.mode };
  rec.isRecording = false;
  emitAudioStatus({ isRecording: false, recording });
  return { success: true, recording };
}

function blobToBase64(blob: any): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new (window as any).FileReader();
      reader.onloadend = () => {
        const res = (reader.result as string) || "";
        const b64 = res.split(",")[1] || "";
        resolve(b64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    } catch (e) { reject(e); }
  });
}

async function snapshotRendererAudio(): Promise<{ base64?: string; mimeType?: string }> {
  if (!rec.isRecording || !rec.mediaRecorder) {
    if (rec.lastBlob) {
      return { base64: rec.lastBase64, mimeType: rec.lastMime };
    }
    return {};
  }
  // Flush current chunk and build a snapshot without stopping
  try { rec.mediaRecorder.requestData(); } catch {}
  await new Promise((r) => setTimeout(r, 200));
  const blob = new Blob(rec.chunks, { type: rec.mediaRecorder.mimeType || "audio/webm" });
  const base64 = await blobToBase64(blob);
  return { base64, mimeType: rec.mediaRecorder.mimeType || "audio/webm" };
}

// Handle main’s request to process; include a renderer audio snapshot if available
ipcRenderer.on("client-process-requested", async () => {
  try {
    const snap = await snapshotRendererAudio();
    if (snap.base64) {
      await ipcRenderer.invoke("process-screenshots-with-audio", { audioBase64: snap.base64, mimeType: snap.mimeType });
    } else {
      await ipcRenderer.invoke("process-screenshots");
    }
  } catch (e) {
    await ipcRenderer.invoke("process-screenshots");
  }
});

const electronAPI = {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  toggleMainWindow: async () => ipcRenderer.invoke("toggle-window"),
  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data);
    ipcRenderer.on("screenshot-taken", subscription);
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription);
    };
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("reset-view", subscription);
    return () => {
      ipcRenderer.removeListener("reset-view", subscription);
    };
  },
  onResponseStart: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription);
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription);
    };
  },
  onFollowUpStart: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_START, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_START,
        subscription
      );
    };
  },
  onFollowUpSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_SUCCESS, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_SUCCESS,
        subscription
      );
    };
  },
  onFollowUpError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_ERROR, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_ERROR,
        subscription
      );
    };
  },
  onFollowUpChunk: (callback: (data: { response: string }) => void) => {
    const subscription = (_: any, data: { response: string }) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.FOLLOW_UP_CHUNK, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.FOLLOW_UP_CHUNK,
        subscription
      );
    };
  },
  onResponseError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error);
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_RESPONSE_ERROR,
        subscription
      );
    };
  },
  onResponseSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.RESPONSE_SUCCESS, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.RESPONSE_SUCCESS,
        subscription
      );
    };
  },
  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  triggerReset: () => ipcRenderer.invoke("trigger-reset"),
  cancelProcessing: () => ipcRenderer.invoke("cancel-processing"),
  triggerMoveLeft: () => ipcRenderer.invoke("trigger-move-left"),
  triggerMoveRight: () => ipcRenderer.invoke("trigger-move-right"),
  triggerMoveUp: () => ipcRenderer.invoke("trigger-move-up"),
  triggerMoveDown: () => ipcRenderer.invoke("trigger-move-down"),
  getPlatform: () => process.platform,
  setApiConfig: (config: { apiKey: string; model: string }) =>
    ipcRenderer.invoke("set-api-config", config),
  getApiConfig: () => ipcRenderer.invoke("get-api-config"),
  getUserProfile: () => ipcRenderer.invoke("get-user-profile"),
  setUserProfile: (profile: string | Record<string, any>) =>
    ipcRenderer.invoke("set-user-profile", profile),
  onApiKeyUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("api-key-updated", subscription);
    return () => {
      ipcRenderer.removeListener("api-key-updated", subscription);
    };
  },
  onApiKeyMissing: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on("api-key-missing", subscription);
    return () => ipcRenderer.removeListener("api-key-missing", subscription);
  },
  setIgnoreMouseEvents: () => ipcRenderer.invoke("set-ignore-mouse-events"),
  setInteractiveMouseEvents: () =>
    ipcRenderer.invoke("set-interactive-mouse-events"),
  // Audio recording methods — renderer-based loopback (getDisplayMedia + WebAudio + MediaRecorder)
  startAudioRecording: startRendererRecording,
  stopAudioRecording: stopRendererRecording,
  getAudioRecordingStatus: async () => ({ success: true, isRecording: rec.isRecording, recording: rec.isRecording ? { startTime: rec.startTime, recordingMode: rec.mode } : undefined }),
  getAudioBase64: async (_: string) => ({ success: true, audioBase64: rec.lastBase64 }),
  onAudioRecordingStatusChanged: (
    callback: (data: { isRecording: boolean; recording?: any }) => void
  ) => {
    audioListeners.add(callback);
    return () => { audioListeners.delete(callback); };
  },
  quitApplication: () => ipcRenderer.invoke("quit-application"),
  onResponseChunk: (callback: (data: { response: string }) => void) => {
    const subscription = (_: any, data: { response: string }) => callback(data);
    ipcRenderer.on(PROCESSING_EVENTS.RESPONSE_CHUNK, subscription);
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.RESPONSE_CHUNK,
        subscription
      );
    };
  },
  // electron-audio-loopback controls (if module registered IPC handlers)
  enableLoopbackAudio: () => ipcRenderer.invoke("enable-loopback-audio").catch((e) => ({ success: false, error: String(e) })),
  disableLoopbackAudio: () => ipcRenderer.invoke("disable-loopback-audio").catch((e) => ({ success: false, error: String(e) })),
} as ElectronAPI;

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Expose platform info
contextBridge.exposeInMainWorld("platform", process.platform);


// Auto hit-test to allow clicking on controls while keeping click-through elsewhere
// Works only because main sets setIgnoreMouseEvents(true, { forward: true })
(() => {
  let lastInteractive = false;
  let rafPending = false;

  const isInteractiveEl = (el: Element | null): boolean => {
    if (!el) return false;
    const interactiveSelectors = [
      '[data-interactive]',
      'button',
      '[role="button"]',
      'a[href]',
      'input',
      'textarea',
      'select'
    ];
    let node: Element | null = el as Element;
    while (node && node !== document.body) {
      for (const sel of interactiveSelectors) {
        if ((node as Element).matches?.(sel)) return true;
      }
      node = (node as HTMLElement).parentElement;
    }
    return false;
  };

  window.addEventListener('mousemove', (evt) => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(async () => {
      rafPending = false;
      try {
        const el = document.elementFromPoint(evt.clientX, evt.clientY);
        const interactive = isInteractiveEl(el);
        if (interactive !== lastInteractive) {
          lastInteractive = interactive;
          if (interactive) {
            await ipcRenderer.invoke('set-interactive-mouse-events');
          } else {
            await ipcRenderer.invoke('set-ignore-mouse-events');
          }
        }
      } catch {}
    });
  }, { passive: true });
})();
