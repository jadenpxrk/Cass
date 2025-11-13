import { BackslashIcon, EnterIcon, MicrophoneIcon } from "./Icons";
import { useEffect, useRef, useState } from "react";

import { COMMAND_KEY } from "../utils/platform";
import { Settings } from "lucide-react";
import Tooltip from "./shared/Tooltip";

interface CommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void;
  view: "initial" | "response" | "followup";
  isLoading?: boolean;
  screenshots?: { id: string; path: string; preview?: string; timestamp: number }[];
}

export default function Commands({
  onTooltipVisibilityChange,
  view,
  isLoading = false,
  screenshots = [],
}: CommandsProps) {
  const isInitialView = view === "initial";
  const showAskFollowUp = !isInitialView && !isLoading;
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null
  );
  const [recordingElapsedTime, setRecordingElapsedTime] = useState(0);

  // Debug: log when component mounts/unmounts
  useEffect(() => {
    console.log(`Commands component mounted with view: ${view}`);
    return () => {
      console.log(`Commands component unmounted from view: ${view}`);
    };
  }, [view]);

  const MAX_RECORDING_TIME = (59 * 60 + 59) * 1000;

  const formatElapsedTime = (timeMs: number) => {
    const totalSeconds = Math.floor(timeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    // Initialize recording state from backend when component mounts
    const initializeRecordingState = async () => {
      try {
        const status = await window.electronAPI.getAudioRecordingStatus();
        if (status.isRecording && status.recording) {
          setIsRecording(true);
          setIsStartingRecording(false);
          setRecordingStartTime(status.recording.startTime);
          setRecordingElapsedTime(Date.now() - status.recording.startTime);
          console.log("Initialized recording state from backend:", status);
        }
      } catch (error) {
        console.error("Failed to initialize recording state:", error);
      }
    };

    // Initialize state on mount
    initializeRecordingState();

    // Listen for real-time recording status changes instead of polling
    const unsubscribe = window.electronAPI.onAudioRecordingStatusChanged(
      ({ isRecording: newIsRecording, recording }) => {
        console.log("Recording status changed:", { newIsRecording, recording });
        
        setIsRecording(newIsRecording);
        
        if (newIsRecording && recording?.startTime) {
          // Recording just started
          setIsStartingRecording(false);
          setRecordingStartTime(recording.startTime);
          setRecordingElapsedTime(0);
          console.log("Recording started - real-time event detected");
        } else if (!newIsRecording) {
          // Recording just stopped
          setIsStartingRecording(false);
          setRecordingStartTime(null);
          setRecordingElapsedTime(0);
          console.log("Recording stopped - real-time event detected");
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []); // Remove isRecording dependency to prevent re-subscription

  useEffect(() => {
    if (isRecording && recordingStartTime) {
      const updateElapsedTime = () => {
        const elapsed = Date.now() - recordingStartTime;
        setRecordingElapsedTime(elapsed);

        if (elapsed >= MAX_RECORDING_TIME) {
          handleStopRecording();
        }
      };

      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 100);
      return () => clearInterval(interval);
    }
  }, [isRecording, recordingStartTime]);

  const handleStopRecording = async () => {
    try {
      const result = await window.electronAPI.stopAudioRecording();
      if (result.success) {
        // UI will be updated by the real-time event when recording actually stops
        console.log("Recording stop command sent, waiting for actual recording to stop...");
      } else {
        console.error("Failed to stop recording:", result.error);
        // Keep current recording state since stop failed
      }
    } catch (error) {
      console.error("Error stopping audio recording:", error);
      // Keep current recording state since stop failed
    }
  };
  const handleMicrophoneClick = async (e: React.MouseEvent) => {
    console.log("Microphone button clicked!"); // Debug log
    e.preventDefault();
    e.stopPropagation();

    try {
      if (isRecording) {
        await handleStopRecording();
      } else {
        // Show starting state immediately
        setIsStartingRecording(true);
        
        // Start recording but don't update UI state yet
        // Let the real-time events detect when recording actually starts
        const result = await window.electronAPI.startAudioRecording();
        if (!result.success) {
          console.error("Failed to start recording:", result.error);
          setIsStartingRecording(false);
        } else {
          console.log(
            "Recording start command sent, waiting for actual recording to begin..."
          );
          // UI will be updated by the real-time event when recording actually starts
        }
      }
    } catch (error) {
      setIsRecording(false);
      setIsStartingRecording(false);
      setRecordingStartTime(null);
      setRecordingElapsedTime(0);
      console.error("Error toggling audio recording:", error);
    }
  };

  const handleMicrophoneMouseEnter = () => {
    window.electronAPI.setInteractiveMouseEvents();
  };

  const handleMicrophoneMouseLeave = () => {
    window.electronAPI.setIgnoreMouseEvents();
  };

  return (
    <div className="select-none">
      <div className="pt-2 w-fit">
        <div className="text-xs text-foreground backdrop-blur-md bg-background/50 rounded-lg py-2 px-4 flex items-center justify-start gap-3">
          <div className="flex items-center gap-2 rounded px-2 py-1.5 pointer-events-none select-none">
            <span className="text-xs leading-none truncate">Show/Hide</span>
            <div className="flex gap-1">
              <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                {COMMAND_KEY}
              </button>
              <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                {BackslashIcon}
              </button>
            </div>
          </div>

          {/* Screenshot shortcut indicator (right of Show/Hide) */}
          <div className="flex items-center gap-2 rounded px-2 py-1.5 pointer-events-none select-none">
            <span className="text-xs leading-none truncate">Screenshot</span>
            <div className="flex gap-1">
              <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                {COMMAND_KEY}
              </button>
              <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                B
              </button>
            </div>
          </div>

          {(isInitialView || showAskFollowUp) && (
            <div className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors pointer-events-none select-none">
              <span className="text-xs leading-none truncate">
                {isInitialView ? "Ask AI" : "Ask Follow Up"}
              </span>
              <div className="flex gap-1">
                <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                  {COMMAND_KEY}
                </button>
                <button className="bg-muted rounded-md px-1.5 py-1 text-xs leading-none">
                  {EnterIcon}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors pointer-events-none select-none">
            <span className="text-xs leading-none truncate">Reset</span>
            <div className="flex gap-1 flex-shrink-0">
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs leading-none">
                {COMMAND_KEY}
              </span>
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs leading-none">
                R
              </span>
            </div>
          </div>

          <button
            className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors cursor-pointer hover:bg-muted/50 bg-transparent border-0 text-foreground"
            onClick={handleMicrophoneClick}
            onMouseEnter={handleMicrophoneMouseEnter}
            onMouseLeave={handleMicrophoneMouseLeave}
            type="button"
            title={
              isRecording
                ? `Recording for ${formatElapsedTime(
                    recordingElapsedTime
                  )} - Click to stop`
                : isStartingRecording
                ? "Starting recording..."
                : "Start recording audio (system + microphone if available)"
            }
          >
            <span className="text-xs leading-none truncate">
              {isRecording ? formatElapsedTime(recordingElapsedTime) : 
               isStartingRecording ? "..." : "00:00"}
            </span>
            <div className="flex gap-1 flex-shrink-0">
              <MicrophoneIcon isRecording={isRecording || isStartingRecording} className="h-3 w-3" />
            </div>
          </button>

          <div className="mx-2 h-4 w-px bg-border" />

          <Tooltip
            onVisibilityChange={onTooltipVisibilityChange}
            trigger={<Settings className="h-4 w-4" />}
          />

          {/* Thumbnails on the right end of the overlay menu bar */}
          {screenshots?.length ? (
            <div className="ml-2 flex items-center gap-2 pointer-events-none select-none">
              {screenshots.slice(-3).map((shot) => (
                <div
                  key={shot.id}
                  className="w-[96px] h-[60px] overflow-hidden rounded border border-border"
                >
                  {shot.preview ? (
                    <img
                      src={`data:image/png;base64,${shot.preview}`}
                      alt="screenshot"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />)
                  }
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
