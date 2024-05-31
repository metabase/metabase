import type { Query } from "history";
import { pick } from "underscore";

import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  DEFAULT_EMBED_DISPLAY_OPTIONS,
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { isNotNull } from "metabase/lib/types";
import { PublicDashboard } from "metabase/public/containers/PublicDashboard/PublicDashboard";
import { Box } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

const _StaticDashboard = ({
  dashboardId,
  parameterQueryParams = {},
  bordered,
  titled,
  theme: userTheme,
  font,
  hideDownloadButton,
  hideParameters,
}: {
  dashboardId: DashboardId;
  parameterQueryParams?: Query;
  hideParameters?: string[];
} & Partial<Omit<EmbedDisplayParams, "hideParameters">>) => {
  const options: EmbedDisplayParams = {
    ...DEFAULT_EMBED_DISPLAY_OPTIONS,
    ...pick(
      {
        bordered,
        titled,
        theme: userTheme,
        font,
        hideDownloadButton,
        hideParameters: hideParameters ? hideParameters.join(",") : null,
      },
      isNotNull,
    ),
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams,
  });
  const { isFullscreen, onFullscreenChange, ref } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({
      onRefresh: refreshDashboard,
    });

  const { hasNightModeToggle, isNightMode, onNightModeChange, theme } =
    useEmbedTheme(options.theme);

  return (
    <Box ref={ref} style={{ overflow: "auto" }}>
      <PublicDashboard
        dashboardId={dashboardId}
        parameterQueryParams={parameterQueryParams}
        bordered={options.bordered}
        font={options.font}
        hasNightModeToggle={hasNightModeToggle}
        hideDownloadButton={options.hideDownloadButton}
        hideParameters={options.hideParameters}
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
        theme={theme}
        titled={options.titled}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
      />
    </Box>
  );
};

const StaticDashboard = withPublicComponentWrapper(_StaticDashboard);

export { EmbedDisplayParams, StaticDashboard };
