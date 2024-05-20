import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { useMount, usePrevious } from "react-use";
import { isEqual, pick } from "underscore";

import { useDashboardDisplayOptions } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-display-options";
import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/hoc/controls/types/hash-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";

const removeEmptyOptions = (obj: Record<string, unknown>) => {
  return pick(obj, isNotFalsy);
};

export type DashboardUrlParamsControls = DashboardDisplayOptionControls;

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

  // these hash options are read-only - we can't control them through the UI.
  // They're provided through embedding options via the URL hash.
  const readOnlyHashOptions: DashboardUrlHashOptions = useMemo(() => {
    return pick(parseHashOptions(location.hash), [
      "bordered",
      "font",
      "titled",
      "hide_download_button",
    ]) as DashboardUrlHashOptions;
  }, [location.hash]);

  // These hash options are writable - we can control them through the UI,
  // so we need to keep them in sync with the URL hash
  const hashOptions: DashboardUrlHashOptions = useMemo(() => {
    return removeEmptyOptions(
      pick(parseHashOptions(location.hash), [
        "fullscreen",
        "theme",
        "hide_parameters",
        "refresh",
      ]),
    ) as DashboardUrlHashOptions;
  }, [location.hash]);

  // TODO: use useEffect to simplify state management
  const stateOptions = useMemo(
    () => ({
      fullscreen: isFullscreen,
      theme,
      hide_parameters: hideParameters,
      refresh: refreshPeriod,
    }),
    [hideParameters, isFullscreen, refreshPeriod, theme],
  );

  const prevStateOptions = usePrevious(stateOptions);

  const loadDashboardParams = useCallback(() => {
    // writeable hash options
    onFullscreenChange(hashOptions.fullscreen || false);
    setTheme(hashOptions.theme || null);
    setHideParameters(hashOptions.hide_parameters || null);
    onRefreshPeriodChange(hashOptions.refresh || null);

    // Read-only hash options with defaults
    setBordered(hashOptions.bordered ?? isWithinIframe());
    setFont(hashOptions.font ?? null);
    setTitled(hashOptions.titled ?? true);
    setHideDownloadButton(hashOptions.hide_download_button ?? true);
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
      const hash = stringifyHashOptions({
        ...readOnlyHashOptions,
        ...removeEmptyOptions({ ...hashOptions, ...stateOptions }),
      });
      dispatch(
        replace({
          ...location,
          hash: hash ? `#${hash}` : "",
        }),
      );
    }
  }, [
    dispatch,
    hashOptions,
    location,
    prevStateOptions,
    readOnlyHashOptions,
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
