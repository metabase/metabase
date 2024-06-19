import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import CS from "metabase/css/core/index.css";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { Box } from "metabase/ui";

export type StaticDashboardProps = SdkDashboardDisplayProps;

export const StaticDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = true,
  hiddenParameters = [],
}: StaticDashboardProps) => {
  const {
    displayOptions,
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
  } = useSdkDashboardParams({
    dashboardId,
    initialParameterValues,
    withTitle,
    withDownloads,
    hiddenParameters,
  });

  const { theme } = useEmbedTheme();

  const { font } = useEmbedFont();

  return (
    <Box w="100%" ref={ref} className={CS.overflowAuto}>
      <PublicOrEmbeddedDashboard
        dashboardId={dashboardId}
        parameterQueryParams={initialParameterValues}
        hideDownloadButton={displayOptions.hideDownloadButton}
        hideParameters={displayOptions.hideParameters}
        titled={displayOptions.titled}
        cardTitled={withCardTitle}
        theme={theme}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        font={font}
        bordered={displayOptions.bordered}
      />
    </Box>
  );
};

const StaticDashboard = withPublicComponentWrapper(StaticDashboardInner);

export { EmbedDisplayParams, StaticDashboard };
