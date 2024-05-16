/* This contains some state for dashboard controls on both private and embedded dashboards.
 * It should probably be in Redux?
 *
 * @deprecated HOCs are deprecated
 */
import type { Location } from "history";
import type { ComponentType } from "react";

import { useSyncURLSlug } from "metabase/dashboard/components/DashboardTabs/use-sync-url-slug";
import {
  useDashboardNav,
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hoc/controls";
import type { DashboardControlsPassedProps } from "metabase/dashboard/hoc/types";
import type { DashboardId } from "metabase-types/api";

export const DashboardControls = (
  ComposedComponent: ComponentType<DashboardControlsPassedProps>,
) => {
  function DashboardControlsInner({
    dashboardId,
    location,
    ...props
  }: {
    dashboardId: DashboardId;
    location: Location;
  }) {
    const queryParams = location.query;

    const { refreshDashboard } = useRefreshDashboard({
      dashboardId,
      queryParams,
    });

    const {
      bordered,
      hasNightModeToggle,
      hideDownloadButton,
      hideParameters,
      isFullscreen,
      isNightMode,
      loadDashboardParams,
      onNightModeChange,
      refreshPeriod,
      setBordered,
      setHideDownloadButton,
      setHideParameters,
      onFullscreenChange,
      setRefreshElapsedHook,
      onRefreshPeriodChange,
      setTheme,
      setTitled,
      theme,
      titled,
    } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

    useDashboardNav({ isFullscreen });

    useSyncURLSlug({ location });

    return (
      <ComposedComponent
        {...props}
        dashboardId={dashboardId}
        location={location}
        isFullscreen={isFullscreen}
        refreshPeriod={refreshPeriod}
        hideParameters={hideParameters}
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        setRefreshElapsedHook={setRefreshElapsedHook}
        loadDashboardParams={loadDashboardParams}
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        bordered={bordered}
        hideDownloadButton={hideDownloadButton}
        setBordered={setBordered}
        setHideDownloadButton={setHideDownloadButton}
        setHideParameters={setHideParameters}
        setTheme={setTheme}
        setTitled={setTitled}
        theme={theme}
        titled={titled}
        queryParams={queryParams}
      />
    );
  }

  return DashboardControlsInner;
};
