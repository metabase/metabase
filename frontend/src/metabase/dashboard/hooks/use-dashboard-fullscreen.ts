import { useFullscreen } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import type { DashboardFullscreenControls } from "../types";

export const useDashboardFullscreen = (): DashboardFullscreenControls & {
  ref: (element: HTMLElement | null) => void;
} => {
  const { ref, toggle, fullscreen } = useFullscreen();

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setIsFullscreen(fullscreen);
  }, [fullscreen]);

  const onFullscreenChange = useCallback(
    (
      nextIsFullscreen: boolean | null,
      openInBrowserFullscreen: boolean = true,
    ) => {
      if (nextIsFullscreen === isFullscreen) {
        return;
      }
      if (isFullscreen || (nextIsFullscreen && openInBrowserFullscreen)) {
        toggle();
      }
      setIsFullscreen(nextIsFullscreen ?? false);
    },
    [isFullscreen, toggle],
  );

  return { ref, isFullscreen, onFullscreenChange };
};
