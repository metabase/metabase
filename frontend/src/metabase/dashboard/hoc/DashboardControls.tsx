import type { ComponentType } from "react";
import { memo } from "react";

import { useSyncURLSlug } from "metabase/dashboard/components/DashboardTabs/use-sync-url-slug";
import {
  useDashboardNav,
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";

import type {
  DashboardControlsPassedProps,
  DashboardControlsProps,
} from "./types";

/**
 * This contains some state for dashboard controls on both private and embedded
 * dashboards. It should probably be in Redux?
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
      setTheme,
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
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        bordered={bordered}
        hideDownloadButton={hideDownloadButton}
        setTheme={setTheme}
        theme={theme}
        titled={titled}
        font={font}
        setFont={setFont}
        parameterQueryParams={parameterQueryParams}
      />
    );
  }

  return memo(DashboardControlsInner);
};
