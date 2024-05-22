import { useFullscreen } from "@mantine/hooks";
import { useEffect, useState } from "react";

import type { DashboardFullscreenControls } from "../types";

export const useDashboardFullscreen = (): DashboardFullscreenControls => {
  const { toggle, fullscreen } = useFullscreen();

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    setIsFullscreen(fullscreen);
  }, [fullscreen]);

  const onFullscreenChange = (
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
  };

  return { isFullscreen, onFullscreenChange };
};
