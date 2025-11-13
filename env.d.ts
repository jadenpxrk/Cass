/// <reference types="vite/client" />

// Extend the Window interface
interface Window {
  __IS_INITIALIZED__: boolean;
  electronAPI: {
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
    onResponseError: (callback: (error: string) => void) => () => void;
    onResponseSuccess: (callback: (data: any) => void) => () => void;
    onFollowUpError: (callback: (error: string) => void) => () => void;
    onFollowUpChunk: (
      callback: (data: { response: string }) => void
    ) => () => void;
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
    // Audio recording events
    onAudioRecordingStatusChanged: (
      callback: (data: { isRecording: boolean; recording?: any }) => void
    ) => () => void;
    // System audio loopback (electron-audio-loopback)
    enableLoopbackAudio: () => Promise<any>;
    disableLoopbackAudio: () => Promise<any>;
  };

  electron?: {
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
  };
}
