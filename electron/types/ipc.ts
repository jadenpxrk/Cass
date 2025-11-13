import type { BrowserWindow } from 'electron';
import type { ScreenshotHelper } from '../helpers/ScreenshotHelper';
import type { ProcessingHelper } from '../services/ProcessingHelper';

export interface ProcessingEventMap {
  FOLLOW_UP_SUCCESS: string;
  FOLLOW_UP_ERROR: string;
  FOLLOW_UP_CHUNK: string;
  API_KEY_INVALID: string;
  INITIAL_START: string;
  RESPONSE_SUCCESS: string;
  INITIAL_RESPONSE_ERROR: string;
  FOLLOW_UP_START: string;
  RESPONSE_CHUNK: string;
  RESET: string;
}

export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper;
  getMainWindow: () => BrowserWindow | null;
  getView: () => 'initial' | 'response' | 'followup';
  setView: (view: 'initial' | 'response' | 'followup') => void;
  getConfiguredModel: () => Promise<string>;
  getUserProfile: () => Promise<string | undefined>;
  setHasFollowedUp: (hasFollowedUp: boolean) => void;
  clearQueues: () => void;
  PROCESSING_EVENTS: ProcessingEventMap;
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null;
  takeScreenshot: () => Promise<string>;
  getImagePreview?: (filepath: string) => Promise<string>;
  processingHelper: ProcessingHelper | null;
  clearQueues: () => void;
  setView: (view: 'initial' | 'response' | 'followup') => void;
  isWindowUsable: () => boolean;
  toggleMainWindow: () => void;
  moveWindowLeft: () => void;
  moveWindowRight: () => void;
  moveWindowUp: () => void;
  moveWindowDown: () => void;
  quitApplication: () => void;
  PROCESSING_EVENTS: ProcessingEventMap;
  setHasFollowedUp: (value: boolean) => void;
  getHasFollowedUp?: () => boolean;
  getConfiguredModel: () => Promise<string>;
}

export interface initializeIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null;
  getScreenshotQueue: () => string[];
  getExtraScreenshotQueue: () => string[];
  processingHelper?: ProcessingHelper;
  setWindowDimensions: (width: number, height: number) => void;
  takeScreenshot: () => Promise<string>;
  toggleMainWindow: () => void;
  clearQueues: () => void;
  setView: (view: 'initial' | 'response' | 'followup') => void;
  moveWindowLeft: () => void;
  moveWindowRight: () => void;
  moveWindowUp: () => void;
  moveWindowDown: () => void;
  quitApplication: () => void;
  getView: () => 'initial' | 'response' | 'followup';
  createWindow: () => Promise<BrowserWindow>;
  PROCESSING_EVENTS: ProcessingEventMap;
  setHasFollowedUp: (value: boolean) => void;
}
