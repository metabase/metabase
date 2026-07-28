import { useDashboardContext } from "metabase/dashboard/context";
import { useLocationSync } from "metabase/dashboard/hooks";
import type { RefreshPeriod } from "metabase/dashboard/types";
import type { WithRouterProps } from "metabase/router";

export const useDashboardLocationSync = ({
  location,
}: Pick<WithRouterProps, "location">) => {
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
    location,
  });

  useLocationSync<boolean>({
    key: "fullscreen",
    value: isFullscreen,
    onChange: (value) => onFullscreenChange(value ?? false),
    location,
  });
};
