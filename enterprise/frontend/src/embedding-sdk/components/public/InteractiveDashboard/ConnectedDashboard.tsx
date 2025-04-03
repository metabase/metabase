import _ from "underscore";

import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import * as dashboardActions from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import type {
  DashboardFullscreenControls,
  DashboardLoaderWrapperProps,
  DashboardRefreshPeriodControls,
} from "metabase/dashboard/types";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import type { DashboardId } from "metabase-types/api";

type ConnectedDashboardProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Record<string, string>;

  downloadsEnabled?: boolean;
  onNavigateToNewCardFromDashboard: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  plugins?: MetabasePluginsConfig;
} & Pick<CommonStylingProps, "className"> &
  DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardLoaderWrapperProps &
  DashboardEventHandlersProps;

const ConnectedDashboardInner = ({
  onLoad,
  onLoadWithoutCards,
}: PublicOrEmbeddedDashboardEventHandlersProps) => {
  const { dashboard } = useDashboardContext();

  useDashboardLoadHandlers({ dashboard, onLoad, onLoadWithoutCards });

  return <Dashboard />;
};

export const ConnectedDashboard = ({
  dashboardId,
  parameterQueryParams,

  downloadsEnabled,
  onNavigateToNewCardFromDashboard,

  isFullscreen,
  onFullscreenChange,

  refreshPeriod,
  onRefreshPeriodChange,
  setRefreshElapsedHook,

  onLoad,
  onLoadWithoutCards,
}: ConnectedDashboardProps) => {
  return (
    <DashboardContextProvider
      dashboardId={dashboardId}
      parameterQueryParams={parameterQueryParams}
      downloadsEnabled={downloadsEnabled ?? false}
      isNightMode={false}
      onNightModeChange={_.noop}
      hasNightModeToggle={false}
      isFullscreen={isFullscreen}
      onFullscreenChange={onFullscreenChange}
      refreshPeriod={refreshPeriod}
      onRefreshPeriodChange={onRefreshPeriodChange}
      setRefreshElapsedHook={setRefreshElapsedHook}
      onNavigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
      autoScrollToDashcardId={undefined}
      reportAutoScrolledToDashcard={_.noop}
    >
      <ConnectedDashboardInner
        onLoad={onLoad}
        onLoadWithoutCards={onLoadWithoutCards}
      />
    </DashboardContextProvider>
  );
};
