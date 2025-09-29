import type { WithRouterProps } from "react-router";

import { useDashboardContext } from "metabase/dashboard/context";
import { useLocationSync } from "metabase/dashboard/hooks";
import type { RefreshPeriod } from "metabase/dashboard/types";
import { useColorScheme } from "metabase/ui";

export const useDashboardLocationSync = ({
  location,
}: Pick<WithRouterProps, "location">) => {
  const {
    refreshPeriod,
    onRefreshPeriodChange,
    isFullscreen,
    onFullscreenChange,
  } = useDashboardContext();
  const { setColorSchemeOverride, colorSchemeOverride } = useColorScheme();

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

  useLocationSync<string | null>({
    key: "theme",
    value: colorSchemeOverride === "dark" ? "night" : null,
    onChange: (value) => {
      setColorSchemeOverride(value === "night" ? "dark" : null);
    },
    location,
  });
};
