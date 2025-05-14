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
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import CS from "metabase/css/core/index.css";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { Box } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

/**
 * @interface
 * @expand
 * @category StaticDashboard
 */
export type StaticDashboardProps = SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

export const StaticDashboardInner = ({
  dashboardId: initialDashboardId,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
  withFooter = true,
  hiddenParameters = [],
  onLoad,
  onLoadWithoutCards,
  style,
  className,
}: StaticDashboardProps) => {
  const errorPage = useSdkSelector(getErrorPage);

  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const {
    displayOptions,
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
    dashboardId,
    isLoading,
  } = useSdkDashboardParams({
    dashboardId: initialDashboardId,
    initialParameters,
    withTitle,
    withDownloads,
    withFooter,
    hiddenParameters,
  });

  const { theme } = useEmbedTheme();

  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(setErrorPage(null));
    }
  }, [dashboardId, dispatch]);

  if (isLoading) {
    return <SdkLoader />;
  }

  if (!dashboardId || errorPage?.status === 404) {
    return <DashboardNotFoundError id={initialDashboardId} />;
  }

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
        bordered={displayOptions.bordered}
        onLoad={handleLoad}
        onLoadWithoutCards={handleLoadWithoutCards}
        onError={(error) => dispatch(setErrorPage(error))}
        downloadsEnabled={{ pdf: withDownloads, results: withDownloads }}
        isNightMode={false}
        onNightModeChange={_.noop}
        hasNightModeToggle={false}
        withFooter={displayOptions.withFooter}
        getClickActionMode={({ question }) =>
          getEmbeddingMode({ question, queryMode: StaticQuestionSdkMode })
        }
        navigateToNewCardFromDashboard={null}
      />
    </Box>
  );
};

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category StaticDashboard
 */
const StaticDashboard =
  withPublicComponentWrapper<StaticDashboardProps>(StaticDashboardInner);

export { EmbedDisplayParams, StaticDashboard };
