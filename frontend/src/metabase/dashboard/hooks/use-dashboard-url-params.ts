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

  const {
    background,
    bordered,
    titled,
    hide_parameters,
    hide_download_button,
  } = useEmbedFrameOptions({ location });

  const {
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  } = useEmbedTheme();

  const normalizedTheme = normalizeTheme({
    theme,
    background,
  });

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
    hasNightModeToggle,
    onNightModeChange,
    isNightMode,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    background,
    bordered,
    titled,
    font,
    setFont,
    theme: normalizedTheme,
    setTheme,
    hideParameters: hide_parameters,
    hideDownloadButton: hide_download_button,
  };
};

/**
 * When both `background: false` and `theme: "transparent"` options are supplied,
 * the new behavior takes precedence (metabase#43838)
 */
function normalizeTheme({
  theme,
  background,
}: {
  theme: DisplayTheme;
  background: boolean;
}) {
  if (!background && theme === "transparent") {
    return "light";
  }

  return theme;
}
