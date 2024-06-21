import type { Location } from "history";

import { useSyncURLSlug } from "metabase/dashboard/components/DashboardTabs/use-sync-url-slug";
import {
  useDashboardNav,
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { DashboardId } from "metabase-types/api";

import { PublicOrEmbeddedDashboard } from "./PublicOrEmbeddedDashboard";
import { WithPublicDashboardEndpoints } from "./WithPublicDashboardEndpoints";

const _PublicOrEmbeddedDashboardPage = ({
  dashboardId,
  location,
}: {
  dashboardId: DashboardId;
  location: Location;
}) => {
  const parameterQueryParams = location.query;

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams,
  });

  const {
    bordered,
    hasNightModeToggle,
    hideDownloadButton,
    hideParameters,
    isFullscreen,
    isNightMode,
    onNightModeChange,
    refreshPeriod,
    onFullscreenChange,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    theme,
    titled,
    font,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  useDashboardNav({ isFullscreen });

  useSyncURLSlug({ location });

  return (
    <PublicOrEmbeddedDashboard
      dashboardId={dashboardId}
      isFullscreen={isFullscreen}
      refreshPeriod={refreshPeriod}
      // TODO: fix
      hideParameters={hideParameters ?? null}
      isNightMode={isNightMode}
      hasNightModeToggle={hasNightModeToggle}
      setRefreshElapsedHook={setRefreshElapsedHook}
      onNightModeChange={onNightModeChange}
      onFullscreenChange={onFullscreenChange}
      onRefreshPeriodChange={onRefreshPeriodChange}
      bordered={bordered}
      // TODO: fix
      hideDownloadButton={hideDownloadButton ?? null}
      theme={theme}
      titled={titled}
      font={font}
      parameterQueryParams={parameterQueryParams}
      cardTitled={true}
    />
  );
};

export const PublicOrEmbeddedDashboardPage = WithPublicDashboardEndpoints(
  // @ts-expect-error - WIP
  _PublicOrEmbeddedDashboardPage,
);
