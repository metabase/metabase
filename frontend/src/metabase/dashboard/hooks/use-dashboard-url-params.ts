import type { Location } from "history";
import { useEffect } from "react";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
} from "metabase/dashboard/hooks";
import { useLocationSync } from "metabase/dashboard/hooks/use-location-sync";
import type { RefreshPeriod } from "metabase/dashboard/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types/hash-options";
import { parseHashOptions } from "metabase/lib/browser";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import type { DisplayTheme } from "metabase/public/lib/types";

import { useEmbedFont } from "./use-embed-font";

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}) => {
  const { font, setFont } = useEmbedFont();

  const { bordered, titled, hide_parameters, hide_download_button } =
    useEmbedFrameOptions({ location });

  const {
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  } = useEmbedTheme();

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
    const { font } = parseHashOptions(location.hash) as DashboardUrlHashOptions;
    if (font) {
      setFont(font);
    }
  }, [location.hash, setFont]);

  return {
    isFullscreen,
    onFullscreenChange,
    hideParameters: hide_parameters,
    hasNightModeToggle,
    onNightModeChange,
    setTheme,
    theme,
    isNightMode,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    bordered,
    titled,
    hideDownloadButton: hide_download_button,
    font,
    setFont,
  };
};
