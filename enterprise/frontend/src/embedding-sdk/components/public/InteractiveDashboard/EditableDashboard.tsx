import type { SdkPluginsConfig } from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
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
import { Box } from "metabase/ui";

import { EditableDashboardView } from "./EditableDashboardView";
import { InteractiveDashboardProvider } from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

type EditableDashboardProps = {
  questionHeight?: number;
  plugins?: SdkPluginsConfig;
  className?: string;
} & Omit<SdkDashboardDisplayProps, "withTitle" | "hiddenParameters"> &
  PublicOrEmbeddedDashboardEventHandlersProps;

const EditableDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  withDownloads = true,
  questionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
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
    initialParameterValues,
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
    <Box w="100%" h="100%" ref={ref} className={className}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          withTitle
          height={questionHeight}
          plugins={plugins}
          onNavigateBack={onNavigateBackToDashboard}
        />
      ) : (
        <InteractiveDashboardProvider
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={dashboardActions}
        >
          <EditableDashboardView
            dashboardId={dashboardId}
            parameterQueryParams={initialParameterValues}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
            downloadsEnabled={withDownloads}
            onLoad={onLoad}
            onLoadWithoutCards={onLoadWithoutCards}
          />
        </InteractiveDashboardProvider>
      )}
    </Box>
  );
};

export const EditableDashboard = withPublicComponentWrapper(
  EditableDashboardInner,
);
