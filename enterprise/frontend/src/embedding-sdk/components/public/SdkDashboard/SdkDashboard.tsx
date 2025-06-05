import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/EditableDashboard.styled";
import { useSdkDashboardParams } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-types";
import { DASHBOARD_EDITING_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import type { InteractiveDashboardProps } from "../InteractiveDashboard/InteractiveDashboard";
import {
  type InteractiveDashboardContextType,
  InteractiveDashboardProvider,
} from "../InteractiveDashboard/context";
import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

import type { SdkDashboardInternalProps } from "./types";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

const SdkDashboardInner = ({
  adhocQuestionUrl,
  onNavigateBackToDashboard,
  drillThroughQuestionProps,
  plugins,
  onEditQuestion,
  dashboardActions,
  renderDrillThroughQuestion: AdHocQuestionView,
}: Pick<SdkDashboardInternalProps, "renderDrillThroughQuestion"> &
  Pick<
    ReturnType<typeof useCommonDashboardParams>,
    "onNavigateBackToDashboard" | "adhocQuestionUrl" | "onEditQuestion"
  > &
  Pick<InteractiveDashboardProps, "drillThroughQuestionProps"> &
  Pick<InteractiveDashboardContextType, "plugins" | "dashboardActions">) => {
  const { isEditing, downloadsEnabled } = useDashboardContext();
  if (adhocQuestionUrl) {
    return (
      <InteractiveAdHocQuestion
        questionPath={adhocQuestionUrl}
        onNavigateBack={onNavigateBackToDashboard}
        {...drillThroughQuestionProps}
      >
        {AdHocQuestionView && <AdHocQuestionView />}
      </InteractiveAdHocQuestion>
    );
  }

  return (
    <InteractiveDashboardProvider
      plugins={plugins}
      onEditQuestion={onEditQuestion}
      dashboardActions={
        isEditing
          ? DASHBOARD_EDITING_ACTIONS
          : [
              ...(dashboardActions ?? []),
              downloadsEnabled.pdf
                ? DASHBOARD_ACTION.DOWNLOAD_DASHBOARD_PDF
                : null,
            ]
      }
    >
      <Dashboard />
    </InteractiveDashboardProvider>
  );
};

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const SdkDashboard = ({
  dashboardId: initialDashboardId,
  initialParameters,
  hiddenParameters,
  withTitle,
  withCardTitle,
  withDownloads,
  className,
  style,
  onLoad,
  onLoadWithoutCards,
  renderDrillThroughQuestion,
  plugins,
  drillThroughQuestionHeight,
  drillThroughQuestionProps = {
    title: withTitle,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
  dashboardActions = [],
  mode,
}: SdkDashboardInternalProps) => {
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
    isLoading,
    dashboardId,
  } = useSdkDashboardParams({
    dashboardId: initialDashboardId,
    withDownloads,
    withTitle,
    withCardTitle,
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

  const { getClickActionMode, navigateToNewCardFromDashboard } = useMemo(() => {
    if (mode === "static") {
      return {
        getClickActionMode: ({ question }: { question: Question }) =>
          getEmbeddingMode({ question, queryMode: StaticQuestionSdkMode }),
        navigateToNewCardFromDashboard: null,
      };
    } else {
      return {
        getClickActionMode: ({ question }: { question: Question }) =>
          getEmbeddingMode({
            question,
            queryMode: EmbeddingSdkMode,
            plugins: plugins as InternalMetabasePluginsConfig,
          }),
        navigateToNewCardFromDashboard: onNavigateToNewCardFromDashboard,
      };
    }
  }, [mode, onNavigateToNewCardFromDashboard, plugins]);

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

  if (errorPage) {
    return (
      <StyledPublicComponentWrapper
        className={className}
        style={style}
        ref={ref}
      >
        <SdkError
          message={errorPage.data?.message ?? t`Something's gone wrong`}
        />
      </StyledPublicComponentWrapper>
    );
  }

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={initialParameters}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
        downloadsEnabled={displayOptions.downloadsEnabled}
        background={displayOptions.background}
        bordered={displayOptions.bordered}
        hideParameters={displayOptions.hideParameters}
        titled={displayOptions.titled}
        cardTitled={displayOptions.cardTitled}
        theme={displayOptions.theme}
        onLoad={handleLoad}
        onLoadWithoutCards={handleLoadWithoutCards}
        onError={(error) => dispatch(setErrorPage(error))}
        getClickActionMode={getClickActionMode}
      >
        <SdkDashboardInner
          adhocQuestionUrl={adhocQuestionUrl}
          onNavigateBackToDashboard={onNavigateBackToDashboard}
          drillThroughQuestionProps={drillThroughQuestionProps}
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={dashboardActions}
          renderDrillThroughQuestion={renderDrillThroughQuestion}
        />
      </DashboardContextProvider>
    </StyledPublicComponentWrapper>
  );
};
