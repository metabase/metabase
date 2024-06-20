import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { usePrevious } from "react-use";
import { omit } from "underscore";

import { DEFAULT_EMBED_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNullOrUndefined } from "metabase/lib/types";

const DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS: DashboardUrlHashOptions = {
  ...DEFAULT_EMBED_DISPLAY_OPTIONS,
  fullscreen: false,
  refresh: null,
};

// need to type the return value as `any` to satisfy useLocationSync for now
const getDefaultDisplayOption = (key: keyof DashboardUrlHashOptions): any =>
  DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[key];

const isEmptyOrDefault = (value: any, key: keyof DashboardUrlHashOptions) =>
  isNullOrUndefined(value) || value === getDefaultDisplayOption(key);

export const useLocationSync = <T = any>({
  key,
  value,
  onChange,
  location,
}: {
  key: keyof DashboardUrlHashOptions;
  value: T;
  onChange: (value: T | null) => void;
  location: Location;
}) => {
  const dispatch = useDispatch();
  const previousValue = usePrevious(value) ?? null;
  const hashOptions = parseHashOptions(location.hash);
  const hashValue = (hashOptions[key] ?? null) as T | null;

  const defaultValue = getDefaultDisplayOption(key);

  const latestValue = useMemo(() => {
    // prioritize the hash value if we're in the initial state
    const isInitialHashValue = !previousValue && hashValue;

    // check if the hash value has updated
    const isHashValueUpdated = value === previousValue && hashValue !== value;

    // we'll use the hash value if it's changed. otherwise we'll stick with value
    if (isInitialHashValue || isHashValueUpdated) {
      return hashValue ?? defaultValue;
    }

    return value;
  }, [defaultValue, hashValue, previousValue, value]);

  useEffect(() => {
    if (latestValue !== previousValue) {
      onChange(latestValue);

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
  }, [
    dispatch,
    hashOptions,
    key,
    latestValue,
    location,
    onChange,
    previousValue,
    value,
  ]);
};
