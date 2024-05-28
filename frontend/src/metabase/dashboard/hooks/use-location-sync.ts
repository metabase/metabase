import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { usePrevious } from "react-use";
import { omit } from "underscore";

import { DEFAULT_EMBED_DISPLAY_OPTIONS } from "metabase/dashboard/hooks/use-embed-display-options";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNullOrUndefined } from "metabase/lib/types";

const DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS: Record<string, any> = {
  ...DEFAULT_EMBED_DISPLAY_OPTIONS,
  fullscreen: false,
  refresh: null,
};

const getDefaultDisplayOption = (key: string) =>
  DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[key];

const isEmptyOrDefault = (value: any, key: string) =>
  isNullOrUndefined(value) || value === getDefaultDisplayOption(key);

export const useLocationSync = <T = any>({
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
  const hashOptions = parseHashOptions(location.hash);
  const hashValue = useMemo(() => {
    return (hashOptions[key] ?? null) as T | null;
  }, [hashOptions, key]);

  const defaultValue = getDefaultDisplayOption(key);

  const latestValue = useMemo(() => {
    const isInitialHashValue = !previousValue && hashValue;
    const isHashValueUpdated = value === previousValue && hashValue !== value;

    if (isInitialHashValue || isHashValueUpdated) {
      return hashValue ?? defaultValue;
    }
    return value;
  }, [defaultValue, hashValue, previousValue, value]);

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
  }, [dispatch, key, latestValue, location, onChange, previousValue, value]);
};
