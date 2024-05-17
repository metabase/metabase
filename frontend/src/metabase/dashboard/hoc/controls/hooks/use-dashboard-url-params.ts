import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { useMount, usePrevious } from "react-use";
import { isEqual } from "underscore";

import { useDashboardDisplayOptions } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-display-options";
import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/hoc/controls/types/hash-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { isNullOrUndefined } from "metabase/lib/types";

const removeEmptyOptions = (obj: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => !isNullOrUndefined(v)),
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
    font,
    setFont,
  } = useDashboardDisplayOptions({ onRefresh });

  const hashOptions: DashboardUrlHashOptions = useMemo(() => {
    return removeEmptyOptions(
      parseHashOptions(location.hash),
    ) as DashboardUrlHashOptions;
  }, [location.hash]);

  const stateOptions = useMemo(() => {
    return removeEmptyOptions({
      fullscreen: isFullscreen,
      theme,
      hide_parameters: hideParameters,
      refresh: refreshPeriod,
      titled,
      bordered,
      hide_download_button: hideDownloadButton,
      font,
    }) as DashboardUrlHashOptions;
  }, [
    bordered,
    font,
    hideDownloadButton,
    hideParameters,
    isFullscreen,
    refreshPeriod,
    theme,
    titled,
  ]);

  const prevStateOptions = usePrevious(stateOptions);

  const loadDashboardParams = useCallback(() => {
    onFullscreenChange(hashOptions.fullscreen || false);
    setTheme(hashOptions.theme || null);
    setHideParameters(hashOptions.hide_parameters || null);
    onRefreshPeriodChange(hashOptions.refresh || null);
    // the default value for titled = true
    setTitled(hashOptions.titled ?? true);
    setBordered(hashOptions.bordered ?? isWithinIframe());
    setHideDownloadButton(hashOptions.hide_download_button ?? false);
    setFont(hashOptions.font ?? "Lato");
  }, [
    onFullscreenChange,
    hashOptions.fullscreen,
    hashOptions.theme,
    hashOptions.hide_parameters,
    hashOptions.refresh,
    hashOptions.titled,
    hashOptions.bordered,
    hashOptions.hide_download_button,
    hashOptions.font,
    setTheme,
    setHideParameters,
    onRefreshPeriodChange,
    setTitled,
    setBordered,
    setHideDownloadButton,
    setFont,
  ]);

  useMount(() => {
    loadDashboardParams();
  });

  useEffect(() => {
    if (!isEqual(stateOptions, prevStateOptions)) {
      dispatch(
        replace({
          ...location,
          hash: stringifyHashOptions(stateOptions),
        }),
      );
    }
  }, [dispatch, location, prevStateOptions, stateOptions]);

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
    font,
    setFont,
  };
};
