import { useEffect, useRef, useState } from "react";

import Commands from "@/components/Commands";
import { Screenshot } from "@/types";
import { fetchScreenshots } from "@/utils/screenshots";
import { useQuery } from "@tanstack/react-query";

interface InitialProps {
  setView: (view: "initial" | "response" | "followup") => void;
}

export default function Initial({ setView }: InitialProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: screenshots = [], refetch } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight;
        const contentWidth = contentRef.current.scrollWidth;
        if (isTooltipVisible) {
          contentHeight += tooltipHeight;
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    updateDimensions();

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),

      window.electronAPI.onResponseError((error: string) => {
        setView("initial");
        console.error("Processing error:", error);
      }),
    ];

    return () => {
      resizeObserver.disconnect();
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [isTooltipVisible, tooltipHeight]);

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible);
    setTooltipHeight(height);
  };

  return (
    <div ref={contentRef} className="w-0">
      <div className="px-4 py-3">
        <div className="space-y-2 w-fit">
          <Commands
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            view="initial"
            screenshots={screenshots}
          />
        </div>
      </div>
    </div>
  );
}
