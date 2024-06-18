import type { Location } from "history";
import { useEffect } from "react";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
} from "metabase/dashboard/hooks";
import { useEmbedDisplayOptions } from "metabase/dashboard/hooks/use-embed-display-options";
import { useLocationSync } from "metabase/dashboard/hooks/use-location-sync";
import type {
  DashboardDisplayOptionControls,
  RefreshPeriod,
} from "metabase/dashboard/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types/hash-options";
import { parseHashOptions } from "metabase/lib/browser";
import type { DisplayTheme } from "metabase/public/lib/types";

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}): DashboardDisplayOptionControls => {
  const {
    bordered,
    font,
    hasNightModeToggle,
    hideDownloadButton,
    hideParameters,
    isNightMode,
    onNightModeChange,
    setBordered,
    setFont,
    setHideDownloadButton,
    setHideParameters,
    setTheme,
    setTitled,
    theme,
    titled,
  } = useEmbedDisplayOptions();

  const { isFullscreen, onFullscreenChange } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({ onRefresh });

  useLocationSync<RefreshPeriod>({
    key: "refresh",
    value: refreshPeriod,
    onChange: onRefreshPeriodChange,
    location,
  });

  useLocationSync<boolean>({
    key: "fullscreen",
    value: isFullscreen,
    onChange: value => onFullscreenChange(value ?? false),
    location,
  });

  useLocationSync<DisplayTheme>({
    key: "theme",
    value: theme,
    onChange: value => setTheme(value ?? "light"),
    location,
  });

  useEffect(() => {
    const { bordered, titled, font, hide_parameters, hide_download_button } =
      parseHashOptions(location.hash) as DashboardUrlHashOptions;

    setBordered(prevBordered => bordered ?? prevBordered);
    setTitled(prevTitled => titled ?? prevTitled);
    if (font) {
      setFont(font);
    }
    setHideDownloadButton(
      prevHideDownloadButton => hide_download_button ?? prevHideDownloadButton,
    );
    setHideParameters(
      prevHideParameters => hide_parameters ?? prevHideParameters,
    );
  }, [
    bordered,
    font,
    hideDownloadButton,
    hideParameters,
    location.hash,
    setBordered,
    setFont,
    setHideDownloadButton,
    setHideParameters,
    setTitled,
    titled,
  ]);

  return {
    isFullscreen,
    onFullscreenChange,
    hideParameters,
    setHideParameters,
    hasNightModeToggle,
    onNightModeChange,
    setTheme,
    theme,
    isNightMode,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    bordered,
    setBordered,
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
    font,
    setFont,
  };
};
