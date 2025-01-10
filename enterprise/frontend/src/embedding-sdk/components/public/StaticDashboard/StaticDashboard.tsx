import cx from "classnames";
import { useEffect } from "react";
import _ from "underscore";

import {
  DashboardNotFoundError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import CS from "metabase/css/core/index.css";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
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
  style,
  className,
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
    <Box
      w="100%"
      ref={ref}
      className={cx(CS.overflowAuto, className)}
      style={style}
    >
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
  ({ dashboardId: initialDashboardId, ...rest }) => {
    const { isLoading, id: resolvedDashboardId } = useValidatedEntityId({
      type: "dashboard",
      id: initialDashboardId,
    });

    const errorPage = useSdkSelector(getErrorPage);
    const dispatch = useSdkDispatch();
    useEffect(() => {
      if (resolvedDashboardId) {
        dispatch(setErrorPage(null));
      }
    }, [dispatch, resolvedDashboardId]);

    if (isLoading) {
      return <SdkLoader />;
    }

    if (!resolvedDashboardId || errorPage?.status === 404) {
      return <DashboardNotFoundError id={initialDashboardId} />;
    }

    return <StaticDashboardInner dashboardId={resolvedDashboardId} {...rest} />;
  },
);

export { EmbedDisplayParams, StaticDashboard };
