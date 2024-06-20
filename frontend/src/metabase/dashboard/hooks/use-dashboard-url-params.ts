import type { Location } from "history";
import { useEffect } from "react";

import { DEFAULT_EMBED_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
} from "metabase/dashboard/hooks";
import { useLocationSync } from "metabase/dashboard/hooks/use-location-sync";
import type { RefreshPeriod } from "metabase/dashboard/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types/hash-options";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
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

  const hashOptions = parseHashOptions(
    location.hash,
  ) as DashboardUrlHashOptions;

  const bordered =
    hashOptions.bordered ??
    (isWithinIframe() || DEFAULT_EMBED_DISPLAY_OPTIONS.bordered);

  const titled = hashOptions.titled ?? DEFAULT_EMBED_DISPLAY_OPTIONS.titled;

  const hideDownloadButton =
    hashOptions.hide_download_button ??
    DEFAULT_EMBED_DISPLAY_OPTIONS.hideDownloadButton;

  const hideParameters =
    hashOptions.hide_parameters ?? DEFAULT_EMBED_DISPLAY_OPTIONS.hideParameters;

  useEffect(() => {
    const hashOptions = parseHashOptions(
      location.hash,
    ) as DashboardUrlHashOptions;

    setFont(hashOptions.font ?? font);
  }, [font, hideDownloadButton, hideParameters, location.hash, setFont]);

  return {
    isFullscreen,
    onFullscreenChange,
    hideParameters,
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
    hideDownloadButton,
    font,
    setFont,
  };
};
