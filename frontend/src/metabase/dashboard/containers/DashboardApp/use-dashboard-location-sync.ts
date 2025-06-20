import type { WithRouterProps } from "react-router";

import { useDashboardContext } from "metabase/dashboard/context";
import { useLocationSync } from "metabase/dashboard/hooks";
import type { RefreshPeriod } from "metabase/dashboard/types";
import type { DisplayTheme } from "metabase/public/lib/types";

export const useDashboardLocationSync = ({
  location,
}: Pick<WithRouterProps, "location">) => {
  const {
    refreshPeriod,
    onRefreshPeriodChange,
    isFullscreen,
    onFullscreenChange,
    theme,
    setTheme,
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

  useLocationSync<DisplayTheme>({
    key: "theme",
    value: theme,
    onChange: (value) => setTheme(value ?? "light"),
    location,
  });
};
