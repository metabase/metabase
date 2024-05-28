import {
  DEFAULT_EMBED_DISPLAY_OPTIONS,
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type {
  EmbedDisplayParams,
  RefreshPeriod,
} from "metabase/dashboard/types";
import { PublicDashboard } from "metabase/public/containers/PublicDashboard/PublicDashboard";
import { Box } from "metabase/ui";
import type { DashboardId, ParameterId } from "metabase-types/api";

export const StaticDashboard = ({
  dashboardId,
  parameterValues,
  refreshPeriod: initialRefreshPeriod = null,
  displayOptions = {},
}: {
  dashboardId: DashboardId;
  parameterValues: Record<ParameterId, string | string[] | null | undefined>;
  refreshPeriod?: RefreshPeriod;
  displayOptions?: Partial<EmbedDisplayParams>;
}) => {
  const options: EmbedDisplayParams = {
    ...DEFAULT_EMBED_DISPLAY_OPTIONS,
    ...displayOptions,
  };

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    queryParams: parameterValues,
  });
  const { isFullscreen, onFullscreenChange, ref } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({
      onRefresh: refreshDashboard,
      initialRefreshPeriod,
    });

  const { hasNightModeToggle, isNightMode, onNightModeChange, theme } =
    useEmbedTheme(options.theme);

  return (
    <Box ref={ref} style={{ overflow: "auto" }}>
      <PublicDashboard
        dashboardId={dashboardId}
        queryParams={parameterValues}
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
