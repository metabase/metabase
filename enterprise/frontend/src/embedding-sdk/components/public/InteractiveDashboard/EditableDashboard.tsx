import { useEffect } from "react";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
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
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import {
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { getIsEditing } from "metabase/dashboard/selectors";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

import { ConnectedDashboard } from "./ConnectedDashboard";
import { InteractiveDashboardProvider } from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = {
  /**
   * Height of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionHeight?: number;

  /**
   * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
   */
  plugins?: MetabasePluginsConfig;

  /**
   * Props for the drill-through question
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & Omit<SdkDashboardDisplayProps, "withTitle" | "hiddenParameters"> &
  DashboardEventHandlersProps;

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
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
  drillThroughQuestionProps = {
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
          {...drillThroughQuestionProps}
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
