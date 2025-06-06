import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  PublicComponentWrapper,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import CS from "metabase/css/core/index.css";
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
import { Flex } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import {
  type InteractiveDashboardContextType,
  InteractiveDashboardProvider,
} from "../InteractiveDashboard/context";
import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

import type { SdkDashboardInternalProps, SdkDashboardProps } from "./types";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const SdkDashboardInner = ({
  renderDrillThroughQuestion: AdHocQuestionView,
  plugins,
  drillThroughQuestionHeight,
  drillThroughQuestionProps: initQuestionProps,
  dashboardActions = [],
  adhocQuestionUrl,
  onNavigateBackToDashboard,
  onEditQuestion,
  dashboardId,
  initialDashboardId,
}: SdkDashboardInternalProps) => {
  const { isEditing, downloadsEnabled, titled, isLoading } =
    useDashboardContext();

  const drillThroughQuestionProps = initQuestionProps ?? {
    title: titled,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  };

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(setErrorPage(null));
    }
  }, [dispatch, dashboardId]);

  const actions = useMemo(() => {
    const actions =
      (isEditing ? DASHBOARD_EDITING_ACTIONS : dashboardActions) ?? [];
    if (downloadsEnabled.pdf) {
      actions.push(DASHBOARD_ACTION.DOWNLOAD_DASHBOARD_PDF);
    }
    return actions;
  }, [dashboardActions, downloadsEnabled.pdf, isEditing]);

  if (isLoading) {
    return <SdkLoader />;
  }

  if (!dashboardId || errorPage?.status === 404) {
    return <DashboardNotFoundError id={initialDashboardId} />;
  }

  if (errorPage) {
    return (
      <SdkError
        message={errorPage.data?.message ?? t`Something's gone wrong`}
      />
    );
  }

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
      dashboardActions={actions}
    >
      <Dashboard />
    </InteractiveDashboardProvider>
  );
};

export const SdkDashboard = ({
  dashboardId,
  className,
  style,
  dashboardId: initialDashboardId,
  onLoad,
  onLoadWithoutCards,
  initialParameters,
  hiddenParameters,
  plugins,
  withDownloads,
  withTitle,
  withCardTitle,
  renderDrillThroughQuestion,
  drillThroughQuestionHeight,
  drillThroughQuestionProps,
  dashboardActions,
  mode,
}: SdkDashboardProps &
  Pick<InteractiveDashboardContextType, "dashboardActions">) => {
  const dispatch = useSdkDispatch();

  const { displayOptions } = useSdkDashboardParams({
    withDownloads,
    withTitle,
    withCardTitle,
    hiddenParameters,
  });

  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const {
    onNavigateToNewCardFromDashboard,
    adhocQuestionUrl,
    onNavigateBackToDashboard,
    onEditQuestion,
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

  return (
    <DashboardContextProvider
      dashboardId={dashboardId}
      parameterQueryParams={initialParameters}
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
      <WrappedSdkDashboardInner
        className={className}
        style={style}
        initialDashboardId={initialDashboardId}
        dashboardId={dashboardId}
        adhocQuestionUrl={adhocQuestionUrl}
        onNavigateBackToDashboard={onNavigateBackToDashboard}
        onEditQuestion={onEditQuestion}
        renderDrillThroughQuestion={renderDrillThroughQuestion}
        plugins={plugins}
        drillThroughQuestionHeight={drillThroughQuestionHeight}
        drillThroughQuestionProps={drillThroughQuestionProps}
        dashboardActions={dashboardActions}
      />
    </DashboardContextProvider>
  );
};
function WrappedSdkDashboardInner({
  className,
  style,
  initialDashboardId,
  dashboardId,
  adhocQuestionUrl,
  onNavigateBackToDashboard,
  onEditQuestion,
  renderDrillThroughQuestion,
  plugins,
  drillThroughQuestionHeight,
  drillThroughQuestionProps,
  dashboardActions,
}: Pick<SdkDashboardDisplayProps, "className" | "style"> &
  SdkDashboardInternalProps) {
  const { fullscreenRef } = useDashboardContext();

  return (
    <Flex
      component={PublicComponentWrapper}
      mih="100vh"
      bg="bg-dashboard"
      direction="column"
      justify="flex-start"
      align="stretch"
      className={cx(className, CS.overflowAuto)}
      style={style}
      ref={fullscreenRef}
    >
      <SdkDashboardInner
        initialDashboardId={initialDashboardId}
        dashboardId={dashboardId}
        adhocQuestionUrl={adhocQuestionUrl}
        onNavigateBackToDashboard={onNavigateBackToDashboard}
        onEditQuestion={onEditQuestion}
        renderDrillThroughQuestion={renderDrillThroughQuestion}
        plugins={plugins}
        drillThroughQuestionHeight={drillThroughQuestionHeight}
        drillThroughQuestionProps={drillThroughQuestionProps}
        dashboardActions={dashboardActions}
      />
    </Flex>
  );
}
