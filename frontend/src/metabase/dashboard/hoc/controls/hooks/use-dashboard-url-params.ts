import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { useMount, usePrevious } from "react-use";
import { isEqual } from "underscore";

import { useDashboardDisplayOptions } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-display-options";
import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/hoc/controls/types/hash-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";

const removeEmptyOptions = (obj: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => isNotFalsy(v)),
  );
};

export type DashboardUrlParamsControls = DashboardDisplayOptionControls & {
  loadDashboardParams: () => void;
};

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}): DashboardUrlParamsControls => {
  const dispatch = useDispatch();

  const {
    bordered,
    hasNightModeToggle,
    hideDownloadButton,
    hideParameters,
    isFullscreen,
    isNightMode,
    refreshPeriod,
    setBordered,
    setHideDownloadButton,
    setHideParameters,
    onFullscreenChange,
    onNightModeChange,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    setTheme,
    setTitled,
    theme,
    titled,
  } = useDashboardDisplayOptions({ onRefresh: onRefresh });

  const hashOptions: DashboardUrlHashOptions = useMemo(() => {
    return removeEmptyOptions(
      parseHashOptions(location.hash),
    ) as DashboardUrlHashOptions;
  }, [location.hash]);

  const previousHashOptions = usePrevious(hashOptions);

  const stateOptions: DashboardUrlHashOptions = useMemo(
    () =>
      removeEmptyOptions({
        fullscreen: isFullscreen,
        theme,
        hide_parameters: hideParameters,
        refresh: refreshPeriod,
      }),
    [hideParameters, isFullscreen, refreshPeriod, theme],
  );

  const loadDashboardParams = useCallback(() => {
    onFullscreenChange(hashOptions.fullscreen || false);
    setTheme(hashOptions.theme || null);
    setHideParameters(hashOptions.hide_parameters || null);
    onRefreshPeriodChange(hashOptions.refresh || null);
  }, [
    hashOptions,
    setHideParameters,
    onFullscreenChange,
    onRefreshPeriodChange,
    setTheme,
  ]);

  useMount(() => {
    loadDashboardParams();
  });

  useEffect(() => {
    if (!isEqual(stateOptions, hashOptions)) {
      let hash;
      if (!isEqual(hashOptions, previousHashOptions)) {
        // if the hash options have changed, use them
        hash = stringifyHashOptions(hashOptions);
        // ensure that we keep the state and hash options synced
        loadDashboardParams();
      } else {
        // otherwise, the state options have changed, so use them
        hash = stringifyHashOptions(stateOptions);
      }

      if (hash !== location.hash) {
        dispatch(
          replace({
            ...location,
            hash: hash ? "#" + hash : "",
          }),
        );
      }
    }
  }, [
    dispatch,
    hashOptions,
    loadDashboardParams,
    location,
    previousHashOptions,
    stateOptions,
  ]);

  return {
    isFullscreen,
    onFullscreenChange,
    hideParameters,
    setHideParameters,
    hasNightModeToggle,
    onNightModeChange,
    setTheme,
    theme,
    isNightMode,
    refreshPeriod,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    loadDashboardParams,
    bordered,
    setBordered,
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
  };
};
