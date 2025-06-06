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
import { useSdkDashboardParams } from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
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

import type { InteractiveDashboardProps } from "../InteractiveDashboard/InteractiveDashboard";
import {
  type InteractiveDashboardContextType,
  InteractiveDashboardProvider,
} from "../InteractiveDashboard/context";
import { StaticQuestionSdkMode } from "../StaticQuestion/mode";

import type { SdkDashboardInternalProps, SdkDashboardProps } from "./types";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

const SdkDashboardContent = ({
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

  const actions = useMemo(() => {
    const actions =
      (isEditing ? DASHBOARD_EDITING_ACTIONS : dashboardActions) ?? [];
    if (downloadsEnabled.pdf) {
      actions.push(DASHBOARD_ACTION.DOWNLOAD_DASHBOARD_PDF);
    }
    return actions;
  }, [dashboardActions, downloadsEnabled.pdf, isEditing]);

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

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const SdkDashboardInner = ({
  initialParameters,
  withTitle,
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
  displayOptions,
  isFullscreen,
  onFullscreenChange,
  refreshPeriod,
  onRefreshPeriodChange,
  setRefreshElapsedHook,
  isLoading,
  dashboardId,
  initialDashboardId,
  mode,
}: SdkDashboardInternalProps) => {
  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
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

  return (
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
      <SdkDashboardContent
        adhocQuestionUrl={adhocQuestionUrl}
        onNavigateBackToDashboard={onNavigateBackToDashboard}
        drillThroughQuestionProps={drillThroughQuestionProps}
        plugins={plugins}
        onEditQuestion={onEditQuestion}
        dashboardActions={dashboardActions}
        renderDrillThroughQuestion={renderDrillThroughQuestion}
      />
    </DashboardContextProvider>
  );
};

export const SdkDashboard = ({
  className,
  style,

  ...props
}: SdkDashboardProps & Pick<SdkDashboardInternalProps, "mode">) => {
  const sdkDashboardParams = useSdkDashboardParams(props);

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
      ref={sdkDashboardParams.ref}
    >
      <SdkDashboardInner
        {...props}
        {...sdkDashboardParams}
        initialDashboardId={props.dashboardId}
        dashboardId={sdkDashboardParams.dashboardId}
      />
    </Flex>
  );
};
