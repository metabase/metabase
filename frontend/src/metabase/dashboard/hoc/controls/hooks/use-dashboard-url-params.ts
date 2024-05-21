import type { Location } from "history";
import { useEffect, useState } from "react";
import { replace } from "react-router-redux";
import { isEqual, pick } from "underscore";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
} from "metabase/dashboard/hoc/controls";
import { useEmbedDisplayOptions } from "metabase/dashboard/hoc/controls/hooks/use-embed-display-options";
import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/hoc/controls/types/hash-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";

const removeEmptyOptions = (obj: Record<string, unknown>) => {
  return pick(obj, isNotFalsy);
};

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}): DashboardDisplayOptionControls => {
  const dispatch = useDispatch();

  const {
    bordered,
    font,
    hasNightModeToggle,
    hideDownloadButton,
    hideParameters,
    isNightMode,
    onNightModeChange,
    setBordered,
    setFont,
    setHideDownloadButton,
    setHideParameters,
    setTheme,
    setTitled,
    theme,
    titled,
  } = useEmbedDisplayOptions();

  const { isFullscreen, onFullscreenChange } = useDashboardFullscreen();
  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({ onRefresh });

  const [readOnlyHashOptions, setReadOnlyHashOptions] =
    useState<DashboardUrlHashOptions>({});

  useEffect(() => {
    const options = pick(parseHashOptions(location.hash), [
      "bordered",
      "font",
      "titled",
      "hide_download_button",
      "fullscreen",
      "theme",
      "hide_parameters",
      "refresh",
    ]) as DashboardUrlHashOptions;

    setBordered(options.bordered ?? bordered);
    setTitled(options.titled ?? titled);
    setHideDownloadButton(options.hide_download_button ?? hideDownloadButton);
    setFont(options.font ?? font);
    setHideParameters(options.hide_parameters ?? hideParameters);
    onFullscreenChange(options.fullscreen ?? isFullscreen);
    setTheme(options.theme ?? theme);
    onRefreshPeriodChange(options.refresh ?? refreshPeriod);

    setReadOnlyHashOptions({
      bordered,
      font,
      titled,
      hide_download_button: hideDownloadButton,
      fullscreen: isFullscreen,
      theme,
      hide_parameters: hideParameters,
      refresh: refreshPeriod,
    });

    // TODO: remove this eslint-disable once we have a proper way to handle this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  useEffect(() => {
    const newOptions = {
      fullscreen: isFullscreen,
      theme,
      refresh: refreshPeriod,
    };

    if (
      !isEqual(newOptions, pick(readOnlyHashOptions, Object.keys(newOptions)))
    ) {
      setReadOnlyHashOptions(prevState => ({
        ...prevState,
        ...newOptions,
      }));
      const opts = stringifyHashOptions(removeEmptyOptions(newOptions));

      dispatch(
        replace({
          ...location,
          hash: opts ? "#" + opts : "",
        }),
      );
    }
  }, [
    dispatch,
    isFullscreen,
    location,
    readOnlyHashOptions,
    refreshPeriod,
    theme,
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
