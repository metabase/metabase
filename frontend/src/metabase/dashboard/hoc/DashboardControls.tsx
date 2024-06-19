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
      hasNightModeToggle,
      isFullscreen,
      isNightMode,
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
      background,
      bordered,
      titled,
      theme,
      font,
      hideDownloadButton,
      hideParameters,
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
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setBordered={setBordered}
        setHideDownloadButton={setHideDownloadButton}
        setHideParameters={setHideParameters}
        setTheme={setTheme}
        setTitled={setTitled}
        background={background}
        bordered={bordered}
        titled={titled}
        theme={theme}
        hideDownloadButton={hideDownloadButton}
        hideParameters={hideParameters}
        font={font}
        setFont={setFont}
        parameterQueryParams={parameterQueryParams}
      />
    );
  }

  return memo(DashboardControlsInner);
};
