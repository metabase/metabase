import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { usePrevious } from "react-use";
import { omit } from "underscore";

import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
} from "metabase/dashboard/hooks";
import {
  DEFAULT_EMBED_DISPLAY_OPTIONS,
  useEmbedDisplayOptions,
} from "metabase/dashboard/hooks/use-embed-display-options";
import type {
  RefreshPeriod,
  DashboardDisplayOptionControls,
} from "metabase/dashboard/types";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types/hash-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNullOrUndefined } from "metabase/lib/types";
import type { DisplayTheme } from "metabase/public/lib/types";

const DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS: Record<string, any> = {
  ...DEFAULT_EMBED_DISPLAY_OPTIONS,
  fullscreen: false,
  refresh: null,
};

const getDefaultDisplayOption = (key: string) =>
  DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[key];

const isEmptyOrDefault = (value: any, key: string) =>
  isNullOrUndefined(value) || value === getDefaultDisplayOption(key);

const useLocationSync = <T = any>({
  key,
  value,
  onChange,
  location,
}: {
  key: string;
  value: T;
  onChange: (value: T | null) => void;
  location: Location;
}) => {
  const dispatch = useDispatch();
  const previousValue = usePrevious(value) ?? null;
  const hashValue = useMemo(() => {
    const hashOptions = parseHashOptions(location.hash);
    return hashOptions[key] ?? (null as T | null);
  }, [key, location.hash]);

  const latestValue = useMemo(() => {
    let val: T;
    if (value !== previousValue) {
      val = value;
    } else if (hashValue !== value) {
      val = hashValue ?? getDefaultDisplayOption(key);
    } else {
      val = value;
    }

    return val;
  }, [hashValue, key, previousValue, value]);

  useEffect(() => {
    if (latestValue !== previousValue) {
      onChange(latestValue);

      const hashOptions = parseHashOptions(location.hash);
      const updatedOptions = isEmptyOrDefault(latestValue, key)
        ? omit(hashOptions, key)
        : {
            ...hashOptions,
            [key]: latestValue,
          };

      const hashString = stringifyHashOptions(updatedOptions);

      dispatch(
        replace({
          ...location,
          hash: hashString ? "#" + hashString : "",
        }),
      );
    }
  }, [dispatch, key, latestValue, location, onChange, previousValue]);
};

export const useDashboardUrlParams = ({
  location,
  onRefresh,
}: {
  location: Location;
  onRefresh: () => Promise<void>;
}): DashboardDisplayOptionControls => {
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

  useLocationSync<RefreshPeriod>({
    key: "refresh",
    value: refreshPeriod,
    onChange: onRefreshPeriodChange,
    location,
  });

  useLocationSync<boolean>({
    key: "fullscreen",
    value: isFullscreen,
    onChange: value => onFullscreenChange(value ?? false),
    location,
  });

  useLocationSync<DisplayTheme>({
    key: "theme",
    value: theme,
    onChange: value => setTheme(value ?? "light"),
    location,
  });

  useEffect(() => {
    const hashOptions = parseHashOptions(
      location.hash,
    ) as DashboardUrlHashOptions;
    setTitled(hashOptions.titled ?? titled);
    setBordered(hashOptions.bordered ?? bordered);
    setFont(hashOptions.font ?? font);
    setHideDownloadButton(
      hashOptions.hide_download_button ?? hideDownloadButton,
    );
    setHideParameters(hashOptions.hide_parameters ?? hideParameters);
  }, [
    bordered,
    font,
    hideDownloadButton,
    hideParameters,
    location.hash,
    setBordered,
    setFont,
    setHideDownloadButton,
    setHideParameters,
    setTitled,
    titled,
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
