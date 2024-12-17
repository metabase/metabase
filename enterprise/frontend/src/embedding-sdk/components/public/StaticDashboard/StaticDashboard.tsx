import _ from "underscore";

import {
  SdkError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import CS from "metabase/css/core/index.css";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { Box } from "metabase/ui";

export type StaticDashboardProps = SdkDashboardDisplayProps &
  PublicOrEmbeddedDashboardEventHandlersProps;

export const StaticDashboardInner = ({
  dashboardId,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
  hiddenParameters = [],
  onLoad,
  onLoadWithoutCards,
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
    initialParameters,
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
        parameterQueryParams={initialParameters}
        hideParameters={displayOptions.hideParameters}
        background={displayOptions.background}
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
        onLoad={onLoad}
        onLoadWithoutCards={onLoadWithoutCards}
        downloadsEnabled={withDownloads}
        isNightMode={false}
        onNightModeChange={_.noop}
        hasNightModeToggle={false}
      />
    </Box>
  );
};

const StaticDashboard = withPublicComponentWrapper<StaticDashboardProps>(
  ({ dashboardId, ...rest }) => {
    const { isLoading, id } = useValidatedEntityId({
      type: "dashboard",
      id: dashboardId,
    });

    if (!id) {
      return isLoading ? <SdkLoader /> : <SdkError message="ID not found" />;
    }

    return <StaticDashboardInner dashboardId={id} {...rest} />;
  },
);

export { EmbedDisplayParams, StaticDashboard };
