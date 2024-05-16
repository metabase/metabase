import { useState } from "react";
import { useMount, useUnmount } from "react-use";
import screenfull from "screenfull";

export type DashboardFullscreenControls = {
  isFullscreen: boolean;
  onFullscreenChange: (
    newIsFullscreen: boolean,
    browserFullscreen?: boolean,
  ) => Promise<void>;
};

export const useDashboardFullscreen = (): DashboardFullscreenControls => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const _fullScreenChanged = () => {
    setIsFullscreen(screenfull.isFullscreen);
  };

  useMount(() => {
    if (screenfull.isEnabled) {
      document.addEventListener(
        screenfull.raw.fullscreenchange,
        _fullScreenChanged,
      );
    }
  });

  useUnmount(() => {
    if (screenfull.isEnabled) {
      document.removeEventListener(
        screenfull.raw.fullscreenchange,
        _fullScreenChanged,
      );
    }
  });

  const onFullscreenChange = async (
    newIsFullscreen: boolean,
    browserFullscreen: boolean = true,
  ) => {
    if (newIsFullscreen !== isFullscreen) {
      if (screenfull.isEnabled && browserFullscreen) {
        if (newIsFullscreen) {
          try {
            // Some browsers block this unless it was initiated by user
            // interaction. If it fails, we catch the error since we still
            // want to set the "isFullscreen" option in state.
            await screenfull.request();
          } catch (e) {
            console.warn(`Couldn't enable browser fullscreen: ${e}`);
          }
        } else {
          await screenfull.exit();
        }
      }
      setIsFullscreen(newIsFullscreen);
    }
  };

  return { isFullscreen, onFullscreenChange };
};
