import type { SourcesOptions } from 'electron';

export const ipcEvents = {
  enableLoopbackAudio: 'enable-loopback-audio',
  disableLoopbackAudio: 'disable-loopback-audio',
} as const;

export const defaultSourcesOptions: SourcesOptions = { types: ['screen'] };

export const featureSwitchKey = 'enable-features' as const;

export const loopbackAudioTypes = {
  loopback: 'loopback',
  loopbackWithMute: 'loopbackWithMute',
} as const;

const defaultFeatureFlags = {
  pulseaudioLoopbackForScreenShare: 'PulseaudioLoopbackForScreenShare',
  macLoopbackAudioForScreenShare: 'MacLoopbackAudioForScreenShare',
} as const;

const coreAudioTapFeatureFlags = {
  macCoreAudioTapSystemAudioLoopbackOverride: 'MacCatapSystemAudioLoopbackCapture',
} as const;

const screenCaptureKitFeatureFlags = {
  macScreenCaptureKitSystemAudioLoopbackOverride: 'MacSckSystemAudioLoopbackOverride',
} as const;

export const buildFeatureFlags = ({
  otherEnabledFeatures,
  forceCoreAudioTap,
}: {
  otherEnabledFeatures?: string[];
  forceCoreAudioTap?: boolean;
}): string => {
  const featureFlags = [
    ...Object.values(defaultFeatureFlags),
    ...(otherEnabledFeatures ?? []),
  ];

  if (forceCoreAudioTap) {
    featureFlags.push(
      coreAudioTapFeatureFlags.macCoreAudioTapSystemAudioLoopbackOverride
    );
  } else {
    featureFlags.push(
      screenCaptureKitFeatureFlags.macScreenCaptureKitSystemAudioLoopbackOverride
    );
  }

  return featureFlags.join(',');
};

