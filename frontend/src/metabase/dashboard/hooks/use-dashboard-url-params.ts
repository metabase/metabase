import type { Location } from "history";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
} from "metabase/dashboard/hooks";
import { useLocationSync } from "metabase/dashboard/hooks/use-location-sync";
import type { RefreshPeriod } from "metabase/dashboard/types";
import { useEmbedFrameOptions, useSetEmbedFont } from "metabase/public/hooks";
import type { DisplayTheme } from "metabase/public/lib/types";

import { useAutoScrollToDashcard } from "./use-auto-scroll-to-dashcard";

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}) => {
  useSetEmbedFont({ location });

  const {
    background,
    bordered,
    titled,
    hide_parameters,
    downloadsEnabled,
    locale,
  } = useEmbedFrameOptions({ location });

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
  const { autoScrollToDashcardId, reportAutoScrolledToDashcard } =
    useAutoScrollToDashcard(location);

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
    theme,
    setTheme,
    hideParameters: hide_parameters,
    downloadsEnabled,
    locale,
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
  };
};
