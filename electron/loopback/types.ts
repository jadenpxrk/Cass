import type { DesktopCapturerSource, Session, SourcesOptions } from 'electron';

export interface InitMainOptions {
  sourcesOptions?: SourcesOptions;
  onAfterGetSources?: (sources: DesktopCapturerSource[]) => DesktopCapturerSource[];
  forceCoreAudioTap?: boolean;
  loopbackWithMute?: boolean;
  sessionOverride?: Session;
}

