import { type ReactNode, useCallback, useEffect } from "react";
import _ from "underscore";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { renderOnlyInSdkProvider } from "embedding-sdk/components/private/SdkContext";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/InteractiveDashboard.styled";
import { useCommonDashboardParams } from "embedding-sdk/components/public/InteractiveDashboard/use-common-dashboard-params";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

import { InteractiveDashboardProvider } from "./context";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = {
  /**
   * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
   */
  plugins?: MetabasePluginsConfig;

  // @todo pass the question context to the question view component,
  //       once we have a public-facing question context.
  /**
   * A custom React component to render the question layout.
   * Use namespaced InteractiveQuestion components to build the layout.
   */
  renderDrillThroughQuestion?: () => ReactNode;

  /**
   * Height of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionHeight?: number;

  /**
   * Props of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

const InteractiveDashboardInner = ({
  dashboardId: initialDashboardId,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
  withFooter = true,
  hiddenParameters = [],
  drillThroughQuestionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
  style,
  drillThroughQuestionProps = {
    title: withTitle,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
  renderDrillThroughQuestion: AdHocQuestionView,
}: InteractiveDashboardProps) => {
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
    withDownloads,
    withTitle,
    withFooter,
    hiddenParameters,
    initialParameters,
  });

  const {
    adhocQuestionUrl,
    onNavigateBackToDashboard,
    onEditQuestion,
    onNavigateToNewCardFromDashboard,
  } = useCommonDashboardParams({
    dashboardId,
  });

  const { theme } = useEmbedTheme();

  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      getEmbeddingMode({
        question,
        plugins: plugins as InternalMetabasePluginsConfig,
      }),
    [plugins],
  );

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(setErrorPage(null));
    }
  }, [dispatch, dashboardId]);

  if (isLoading) {
    return (
      <StyledPublicComponentWrapper className={className} style={style}>
        <SdkLoader />
      </StyledPublicComponentWrapper>
    );
  }

  if (!dashboardId || errorPage?.status === 404) {
    return (
      <StyledPublicComponentWrapper className={className} style={style}>
        <DashboardNotFoundError id={initialDashboardId} />
      </StyledPublicComponentWrapper>
    );
  }

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          onNavigateBack={onNavigateBackToDashboard}
          {...drillThroughQuestionProps}
        >
          {AdHocQuestionView && <AdHocQuestionView />}
        </InteractiveAdHocQuestion>
      ) : (
        <InteractiveDashboardProvider
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
        >
          <PublicOrEmbeddedDashboard
            dashboardId={dashboardId}
            parameterQueryParams={initialParameters}
            hideParameters={displayOptions.hideParameters}
            background={displayOptions.background}
            titled={displayOptions.titled}
            cardTitled={withCardTitle}
            withFooter={displayOptions.withFooter}
            theme={theme}
            getClickActionMode={getClickActionMode}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            bordered={displayOptions.bordered}
            navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
            onLoad={onLoad}
            onLoadWithoutCards={onLoadWithoutCards}
            downloadsEnabled={{ pdf: withDownloads, results: withDownloads }}
            isNightMode={false}
            onNightModeChange={_.noop}
            hasNightModeToggle={false}
          />
        </InteractiveDashboardProvider>
      )}
    </StyledPublicComponentWrapper>
  );
};

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = renderOnlyInSdkProvider(
  InteractiveDashboardInner,
);
