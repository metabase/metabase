import type { CSSProperties } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/EditableDashboard.styled";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkSelector } from "embedding-sdk/store";
import {
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { getIsEditing } from "metabase/dashboard/selectors";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";

import { ConnectedDashboard } from "./ConnectedDashboard";
import { InteractiveDashboardProvider } from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

export type EditableDashboardProps = {
  drillThroughQuestionHeight?: number;
  plugins?: SdkPluginsConfig;
  className?: string;
  style?: CSSProperties;
} & Omit<SdkDashboardDisplayProps, "withTitle" | "hiddenParameters"> &
  PublicOrEmbeddedDashboardEventHandlersProps;

export const EditableDashboard = ({
  dashboardId,
  initialParameters = {},
  withDownloads = false,
  drillThroughQuestionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
  style,
}: EditableDashboardProps) => {
  const {
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
  } = useSdkDashboardParams({
    dashboardId,
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

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          withTitle
          height={drillThroughQuestionHeight}
          plugins={plugins}
          onNavigateBack={onNavigateBackToDashboard}
        />
      ) : (
        <InteractiveDashboardProvider
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={dashboardActions}
        >
          <ConnectedDashboard
            dashboardId={dashboardId}
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
