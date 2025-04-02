import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
} from "react";
import _ from "underscore";

import type { MetabasePluginsConfig } from "embedding-sdk";
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
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import { InteractiveDashboardProvider } from "./context";

export type InteractiveDashboardProps = {
  className?: string;
  style?: CSSProperties;
  plugins?: MetabasePluginsConfig;

  /**
   * A custom React component to render the question layout.
   * Use namespaced InteractiveQuestion components to build the layout.
   *
   * @todo pass the question context to the question view component,
   *       once we have a public-facing question context.
   */
  renderDrillThroughQuestion?: () => ReactNode;
  drillThroughQuestionHeight?: number;
} & SdkDashboardDisplayProps &
  PublicOrEmbeddedDashboardEventHandlersProps;

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
        plugins,
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
          title={withTitle}
          height={drillThroughQuestionHeight}
          plugins={plugins}
          onNavigateBack={onNavigateBackToDashboard}
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
            downloadsEnabled={withDownloads}
            isNightMode={false}
            onNightModeChange={_.noop}
            hasNightModeToggle={false}
          />
        </InteractiveDashboardProvider>
      )}
    </StyledPublicComponentWrapper>
  );
};

export const InteractiveDashboard = renderOnlyInSdkProvider(
  InteractiveDashboardInner,
);
