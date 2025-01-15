import { type CSSProperties, type ReactNode, useEffect } from "react";
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
import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";

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
  dashboardId,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
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
  } = useSdkDashboardParams({
    dashboardId,
    withDownloads,
    withTitle,
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
  const { font } = useEmbedFont();

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
            theme={theme}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            font={font}
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
  ({ dashboardId: initialDashboardId, ...rest }: InteractiveDashboardProps) => {
    const { id: resolvedDashboardId, isLoading } = useValidatedEntityId({
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

    const { style, className } = rest;
    if (isLoading) {
      return (
        <StyledPublicComponentWrapper className={className} style={style}>
          <SdkLoader />
        </StyledPublicComponentWrapper>
      );
    }

    if (!resolvedDashboardId || errorPage?.status === 404) {
      return (
        <StyledPublicComponentWrapper className={className} style={style}>
          <DashboardNotFoundError id={initialDashboardId} />
        </StyledPublicComponentWrapper>
      );
    }

    return (
      <InteractiveDashboardInner dashboardId={resolvedDashboardId} {...rest} />
    );
  },
);
