import { type CSSProperties, useEffect } from "react";

import type {
  InteractiveQuestionProps,
  MetabasePluginsConfig,
} from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import type { InteractiveQuestionDefaultViewProps } from "embedding-sdk/components/private/InteractiveQuestionDefaultView";
import {
  DashboardNotFoundError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/EditableDashboard.styled";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import {
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { getIsEditing } from "metabase/dashboard/selectors";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";

import { ConnectedDashboard } from "./ConnectedDashboard";
import { InteractiveDashboardProvider } from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

export type EditableDashboardProps = {
  drillThroughQuestionHeight?: number;
  plugins?: MetabasePluginsConfig;
  className?: string;
  style?: CSSProperties;
  questionProps?: Omit<InteractiveQuestionProps, "questionId"> &
    InteractiveQuestionDefaultViewProps;
} & Omit<SdkDashboardDisplayProps, "withTitle" | "hiddenParameters"> &
  PublicOrEmbeddedDashboardEventHandlersProps;

export const EditableDashboard = ({
  dashboardId: initialDashboardId,
  initialParameters = {},
  withDownloads = false,
  drillThroughQuestionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
  style,
  questionProps = {
    title: true,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
}: EditableDashboardProps) => {
  const {
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
    withTitle: true,
    hiddenParameters: undefined,
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

  const isEditing = useSdkSelector(getIsEditing);
  const dashboardActions = isEditing
    ? DASHBOARD_EDITING_ACTIONS
    : SDK_DASHBOARD_VIEW_ACTIONS;

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

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          onNavigateBack={onNavigateBackToDashboard}
          {...questionProps}
        />
      ) : (
        <InteractiveDashboardProvider
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={dashboardActions}
        >
          <ConnectedDashboard
            dashboardId={dashboardId}
            isLoading={isLoading}
            parameterQueryParams={initialParameters}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            noLoaderWrapper
            onNavigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
            downloadsEnabled={withDownloads}
            onLoad={onLoad}
            onLoadWithoutCards={onLoadWithoutCards}
          />
        </InteractiveDashboardProvider>
      )}
    </StyledPublicComponentWrapper>
  );
};
