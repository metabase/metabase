import type { Location } from "history";
import { useEffect } from "react";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
} from "metabase/dashboard/hooks";
import {
  DEFAULT_EMBED_DISPLAY_OPTIONS,
  useEmbedDisplayOptions,
} from "metabase/dashboard/hooks/use-embed-display-options";
import { useLocationSync } from "metabase/dashboard/hooks/use-location-sync";
import type { RefreshPeriod } from "metabase/dashboard/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types/hash-options";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import type { DisplayTheme } from "metabase/public/lib/types";

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}) => {
  const {
    font,
    hasNightModeToggle,
    hideDownloadButton,
    hideParameters,
    isNightMode,
    onNightModeChange,
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

  const hashOptions = parseHashOptions(
    location.hash,
  ) as DashboardUrlHashOptions;

  const bordered =
    hashOptions.bordered ??
    (isWithinIframe() || DEFAULT_EMBED_DISPLAY_OPTIONS.bordered);

  useEffect(() => {
    const hashOptions = parseHashOptions(
      location.hash,
    ) as DashboardUrlHashOptions;
    setTitled(hashOptions.titled ?? titled);
    setFont(hashOptions.font ?? font);
    setHideDownloadButton(
      hashOptions.hide_download_button ?? hideDownloadButton,
    );
    setHideParameters(hashOptions.hide_parameters ?? hideParameters);
  }, [
    font,
    hideDownloadButton,
    hideParameters,
    location.hash,
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
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
    font,
    setFont,
  };
};
