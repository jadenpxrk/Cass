import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";

export interface TooltipProps {
  onVisibilityChange: (visible: boolean, height: number) => void;
  trigger: React.ReactNode;
}

const MODEL_OPTIONS = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Fast and efficient Gemini model (Google)",
    default: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Advanced reasoning and capabilities (Google)",
  },
];

export default function Tooltip({ trigger, onVisibilityChange }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    () => MODEL_OPTIONS.find((m) => m.default)?.id || "gemini-2.5-flash"
  );
  const [profile, setProfile] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout>();
  const [audioStatus, setAudioStatus] = useState<{
    isRecording: boolean;
    mode: "mixed" | "system-only" | "microphone-only" | "idle";
  }>({ isRecording: false, mode: "idle" });

  useEffect(() => {
    const loadCurrentConfig = async () => {
      try {
        const api = window.electronAPI as any;
        const response = await api.getApiConfig();
        if (response.success) {
          if (response.apiKey) setApiKey(response.apiKey);
          if (response.model) setSelectedModel(response.model);
        }
        // Load profile if the bridge supports it; ignore errors to remain backward-compatible
        try {
          if (api.getUserProfile) {
            const p = await api.getUserProfile();
            if (p?.success && typeof p.profile === 'string') {
              setProfile(p.profile);
            }
          }
        } catch {}
      } catch {
        setError("Failed to load configuration");
      }
    };
    loadCurrentConfig();

    // Initialize audio capture status
    const initAudioStatus = async () => {
      try {
        const res = await (window.electronAPI as any).getAudioRecordingStatus();
        if (res?.success) {
          const mode = (res.recording?.recordingMode as any) || "idle";
          setAudioStatus({ isRecording: !!res.isRecording, mode });
        }
      } catch {}
    };
    initAudioStatus();

    // Subscribe to runtime changes
    const unsubscribe = (window.electronAPI as any).onAudioRecordingStatusChanged(
      (data: { isRecording: boolean; recording?: any }) => {
        const mode = (data?.recording?.recordingMode as any) || (data.isRecording ? "system-only" : "idle");
        setAudioStatus({ isRecording: !!data.isRecording, mode });
      }
    );

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      window.electronAPI.setIgnoreMouseEvents();
      try { unsubscribe?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    let height = 0;
    if (tooltipRef.current && isVisible)
      height = tooltipRef.current.offsetHeight + 10;
    onVisibilityChange(isVisible, height);
  }, [isVisible, onVisibilityChange]);

  function handleTriggerMouseEnter() {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setIsVisible(true);
    window.electronAPI.setInteractiveMouseEvents();
  }

  function handleTriggerMouseLeave() {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      window.electronAPI.setIgnoreMouseEvents();
    }, 100);
  }

  function handleTooltipContentMouseEnter() {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }

  function handleTooltipContentMouseLeave() {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      window.electronAPI.setIgnoreMouseEvents();
    }, 100);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!apiKey.trim()) {
      setError("API key cannot be empty");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const api = window.electronAPI as any;
      // Save personalization first (if supported), then API config
      try {
        if (api.setUserProfile) {
          await api.setUserProfile(profile ?? "");
        }
      } catch {}
      const result = await api.setApiConfig({
        apiKey: apiKey.trim(),
        model: selectedModel,
      });
      if (result.success) {
        setIsVisible(false);
        window.electronAPI.setIgnoreMouseEvents();
      } else {
        setError(result.error || "Failed to save configuration");
      }
    } catch {
      setError("An error occurred while saving the configuration");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="relative inline-block pointer-events-auto"
      onMouseEnter={handleTriggerMouseEnter}
      onMouseLeave={handleTriggerMouseLeave}
    >
      <div className="w-4 h-4 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
        {trigger}
      </div>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={tooltipRef}
            className="absolute top-full -right-4 mt-8 w-[310px] z-[100] pointer-events-auto"
            onMouseEnter={handleTooltipContentMouseEnter}
            onMouseLeave={handleTooltipContentMouseLeave}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="mt-2 p-3 text-xs bg-background/50 backdrop-blur-md rounded-lg text-foreground shadow-lg">
              <div className="space-y-4">
                {/* Audio capture status */}
                <div className="px-2 py-1.5 rounded-md border border-border/60 bg-muted/20 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Audio Capture</span>
                  <span className="text-[11px] font-medium">
                    {audioStatus.isRecording ? (
                      audioStatus.mode === "mixed" ? "System + Mic" : audioStatus.mode === "system-only" ? "System only" : "Mic only"
                    ) : (
                      "Not recording"
                    )}
                  </span>
                </div>
                <h3 className="font-medium truncate px-2 mb-3 select-none">
                  API Configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-4 px-2">
                  Your API key is stored locally. Select your preferred model.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4 px-2">
                  <div>
                    <label
                      htmlFor="apiKey"
                      className="block text-xs font-medium text-foreground mb-3"
                    >
                      API Key
                    </label>
                    <Input
                      ref={inputRef}
                      type="password"
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter API key (e.g., sk-... or AIza...)"
                      autoComplete="off"
                      spellCheck="false"
                      className="text-xs h-8 select-text"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="profile"
                      className="block text-xs font-medium text-foreground mb-3"
                    >
                      Personalization / Knowledge Base
                    </label>
                    <textarea
                      id="profile"
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                      placeholder="Add details about you, goals, context, style preferences..."
                      className="w-full text-xs h-24 p-2 rounded-md bg-background border border-border resize-y"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      This text is sent as extra context with each request. Stored locally.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="model"
                      className="block text-xs font-medium text-foreground mb-3"
                    >
                      AI Model
                    </label>
                    <RadioGroup
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    >
                      <ScrollArea className="max-h-32 pr-1">
                        <div className="space-y-2">
                          {MODEL_OPTIONS.map((model) => (
                            <div
                              key={model.id}
                              className="flex items-start space-x-2.5"
                            >
                              <RadioGroupItem
                                value={model.id}
                                id={`model-${model.id}`}
                                className="mt-0.5"
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={`model-${model.id}`}
                                  className="text-xs font-medium text-foreground leading-tight"
                                >
                                  {model.name}
                                  {model.default && (
                                    <span className="ml-1.5 text-[10px] bg-primary/60 px-1.5 py-0.5 rounded-full align-middle">
                                      Rec.
                                    </span>
                                  )}
                                </label>
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                  {model.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </RadioGroup>
                  </div>
                  {error && (
                    <div className="text-destructive-foreground text-[11px] py-1.5 px-2 rounded bg-destructive/30 border border-destructive/50">
                      {error}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <Button
                      type="submit"
                      disabled={isLoading}
                      size="sm"
                      className="text-xs h-7"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Config"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="text-xs h-7"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          await (window.electronAPI as any).quitApplication();
                        } catch (error) {}
                      }}
                    >
                      Quit App
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
