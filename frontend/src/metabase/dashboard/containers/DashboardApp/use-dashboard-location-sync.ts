import { useDashboardContext } from "metabase/dashboard/context";
import { useLocationSync } from "metabase/dashboard/hooks";
import type { RefreshPeriod } from "metabase/dashboard/types";

export const useDashboardLocationSync = () => {
  const {
    refreshPeriod,
    onRefreshPeriodChange,
    isFullscreen,
    onFullscreenChange,
  } = useDashboardContext();

  useLocationSync<RefreshPeriod>({
    key: "refresh",
    value: refreshPeriod,
    onChange: onRefreshPeriodChange,
  });

  useLocationSync<boolean>({
    key: "fullscreen",
    value: isFullscreen,
    onChange: (value) => onFullscreenChange(value ?? false),
  });
};
