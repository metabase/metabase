import cx from "classnames";
import { useCallback, useEffect, useRef } from "react";
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
import { getEventHandlers } from "embedding-sdk/store/selectors";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import CS from "metabase/css/core/index.css";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import type { EmbedDisplayParams } from "metabase/dashboard/types";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { useSelector } from "metabase/lib/redux";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { Box } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { Dashboard } from "metabase-types/api";

import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

/**
 * @interface
 * @expand
 * @category StaticDashboard
 */
export type StaticDashboardProps = SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

export const StaticDashboardInner = ({
  dashboardId,
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
  const sdkEventHandlers = useSelector(getEventHandlers);
  // Hack: since we're storing functions in the redux store there are issues
  // with timing and serialization. We'll need to do something about this in the future
  const sdkEventHandlersRef = useRef(sdkEventHandlers);

  useEffect(() => {
    sdkEventHandlersRef.current = sdkEventHandlers;
  }, [sdkEventHandlers]);

  // Use the ref in your callbacks
  const handleLoadWithoutCards = useCallback(
    (dashboard: Dashboard) => {
      onLoadWithoutCards?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoadWithoutCards?.(dashboard);
    },
    [onLoadWithoutCards],
  );

  const handleLoad = useCallback(
    (dashboard: Dashboard) => {
      onLoad?.(dashboard);
      sdkEventHandlersRef.current?.onDashboardLoad?.(dashboard);
    },
    [onLoad],
  );

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
    withFooter,
    hiddenParameters,
  });

  const { theme } = useEmbedTheme();

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
