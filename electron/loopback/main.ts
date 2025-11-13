import { app, session as sessionModule, desktopCapturer, ipcMain } from 'electron';
import type { DesktopCapturerSource } from 'electron';
import { buildFeatureFlags, ipcEvents, defaultSourcesOptions, featureSwitchKey, loopbackAudioTypes } from './config';
import type { InitMainOptions } from './types';

export const initMain = (options: InitMainOptions = {}): void => {
  const {
    forceCoreAudioTap = false,
    loopbackWithMute = false,
    onAfterGetSources,
    sessionOverride,
    sourcesOptions = defaultSourcesOptions,
  } = options;

  const otherEnabledFeatures = app.commandLine
    .getSwitchValue(featureSwitchKey)
    ?.split(',')
    .filter(Boolean);

  if (app.commandLine.hasSwitch(featureSwitchKey)) {
    app.commandLine.removeSwitch(featureSwitchKey);
  }

  const currentFeatureFlags = buildFeatureFlags({
    otherEnabledFeatures,
    forceCoreAudioTap,
  });
  app.commandLine.appendSwitch(featureSwitchKey, currentFeatureFlags);

  ipcMain.handle(ipcEvents.enableLoopbackAudio, async () => {
    const session = sessionOverride || sessionModule.defaultSession;

    session.setDisplayMediaRequestHandler(async (_request, callback) => {
      let sources: DesktopCapturerSource[];
      try {
        sources = await desktopCapturer.getSources(sourcesOptions);
        if (onAfterGetSources) {
          sources = onAfterGetSources(sources);
        }
      } catch (e) {
        throw new Error('Failed to get sources for system audio loopback capture.');
      }
      if (!sources || sources.length === 0) {
        throw new Error('No sources found for system audio loopback capture.');
      }
      callback({
        video: sources[0],
        audio: loopbackWithMute
          ? (loopbackAudioTypes.loopbackWithMute as any)
          : (loopbackAudioTypes.loopback as any),
      });
    });
    return { success: true };
  });

  ipcMain.handle(ipcEvents.disableLoopbackAudio, () => {
    const session = sessionOverride || sessionModule.defaultSession;
    session.setDisplayMediaRequestHandler(null);
    return { success: true };
  });
};

