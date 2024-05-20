import type { ComponentType } from "react";
import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useSyncURLSlug } from "metabase/dashboard/components/DashboardTabs/use-sync-url-slug";
import {
  useDashboardNav,
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hoc/controls";
import type {
  DashboardControlsPassedProps,
  DashboardControlsProps,
} from "metabase/dashboard/hoc/types";
import { useDispatch } from "metabase/lib/redux";

/* This contains some state for dashboard controls on both private and embedded dashboards.
 * It should probably be in Redux?
 *
 * @deprecated HOCs are deprecated
 */
export const DashboardControls = <T extends DashboardControlsProps>(
  ComposedComponent: ComponentType<T>,
): ComponentType<T & DashboardControlsPassedProps> => {
  function DashboardControlsInner({
    dashboardId,
    location,
    ...props
  }: DashboardControlsProps) {
    const dispatch = useDispatch();

    const queryParams = location.query;

    const { refreshDashboard } = useRefreshDashboard({
      dashboardId,
      queryParams,
    });

    // remove all params if the dashboardId changes
    useEffect(() => {
      if (dashboardId) {
        dispatch(replace(location.pathname));
      }
    }, [dashboardId, dispatch, location.pathname]);

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
      font,
      setFont,
    } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

    useDashboardNav({ isFullscreen });

    useSyncURLSlug({ location });

    return (
      <ComposedComponent
        {...(props as T)}
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
        font={font}
        setFont={setFont}
        queryParams={queryParams}
      />
    );
  }

  return DashboardControlsInner;
};
