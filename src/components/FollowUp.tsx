import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Commands from "@/components/Commands";
import { MarkdownSection } from "@/components/shared/MarkdownSection";
import { Screenshot } from "@/types";
import { fetchScreenshots } from "@/utils/screenshots";

interface TaskResponseData {
  response: string;
  isFollowUp?: boolean;
}

interface FollowUpProps {
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
}

export default function FollowUp({
  isProcessing,
  setIsProcessing,
}: FollowUpProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const queryClient = useQueryClient();

  // get cached followup data with proper typing
  const cachedFollowUpData = queryClient.getQueryData<TaskResponseData>([
    "followup_response",
  ]);

  const [responseData, setResponseData] = useState<string | null>(
    cachedFollowUpData?.response || null
  );
  const [streamedResponse, setStreamedResponse] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

  const { data: screenshots = [], refetch } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => {
        refetch();
      }),
      window.electronAPI.onResetView(() => {
        refetch();
        setResponseData(null);
        setStreamedResponse("");
        setIsStreaming(false);
        queryClient.removeQueries({ queryKey: ["followup_response"] });
      }),
      window.electronAPI.onFollowUpStart(() => {
        setIsProcessing(true);
        setResponseData(null);
        setStreamedResponse("");
        setIsStreaming(false);
        queryClient.setQueryData(["followup_response"], null);
      }),
      window.electronAPI.onFollowUpSuccess((rawData: any) => {
        const responseText =
          typeof rawData === "string" ? rawData : rawData?.response || "";

        // Handle empty initial response which signals the start of streaming
        if (!responseText && !isStreaming) {
          setIsStreaming(true);
          setStreamedResponse("");
          return;
        }

        // If we were streaming, we've now received the complete response
        if (isStreaming) {
          setIsStreaming(false);
          // Set the response with the final streamed content
          setResponseData(streamedResponse || responseText);
        } else {
          // Direct response without streaming
          setResponseData(responseText);
        }

        if (!responseText && !streamedResponse) {
          console.warn("Received empty follow-up response data");
          return;
        }

        queryClient.setQueryData(["followup_response"], {
          response: responseText || streamedResponse,
        });
        setIsProcessing(false);
      }),
      window.electronAPI.onFollowUpChunk((data: { response: string }) => {
        setStreamedResponse(data.response);
        setIsStreaming(true);
      }),
      window.electronAPI.onFollowUpError((error: string) => {
        setIsProcessing(false);
        setIsStreaming(false);
      }),
    ];
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [queryClient, refetch, setIsProcessing, isStreaming, streamedResponse]);

  // Determine what content to display - either the completed response or streamed content
  const displayContent = isStreaming ? streamedResponse : responseData;

  const isLoading = isProcessing && !displayContent && !isStreaming;

  return (
    <div ref={contentRef} className="relative space-y-3 px-4 py-3">
      <div className="relative z-10">
        <Commands
          onTooltipVisibilityChange={(visible: boolean, height: number) => {
            setTooltipVisible(visible);
            setTooltipHeight(height);
          }}
          view="followup"
          isLoading={isLoading}
        />
      </div>

      <div className="w-full text-xs text-foreground rounded-md select-none bg-background/50 backdrop-blur-md">
        <div className="rounded-lg overflow-hidden">
          <div className="px-4 py-3 space-y-4">
            <MarkdownSection content={displayContent} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
