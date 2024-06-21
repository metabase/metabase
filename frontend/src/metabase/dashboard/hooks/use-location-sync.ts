import type { Location } from "history";
import { useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { usePrevious } from "react-use";
import { omit } from "underscore";

import { DEFAULT_EMBED_DISPLAY_OPTIONS } from "metabase/dashboard/constants";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { isNullOrUndefined } from "metabase/lib/types";

type SYNCED_KEY = "refresh" | "fullscreen" | "theme";

const DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS = {
  theme: DEFAULT_EMBED_DISPLAY_OPTIONS.theme,
  fullscreen: false,
  refresh: null,
} as const;

const getDefaultDisplayOption = <
  Value extends typeof DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[Key],
  Key extends SYNCED_KEY,
>(
  key: Key,
): Value => DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[key] as Value;

const isEmptyOrDefault = <
  Value extends typeof DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[Key],
  Key extends SYNCED_KEY,
>(
  value: Value,
  key: Key,
) => isNullOrUndefined(value) || value === getDefaultDisplayOption(key);

export const useLocationSync = <
  Value extends typeof DEFAULT_DASHBOARD_EMBED_DISPLAY_OPTIONS[Key],
  Key extends SYNCED_KEY = any,
>({
  key,
  value,
  onChange,
  location,
}: {
  key: Key;
  value: Value;
  onChange: (value: Value | null) => void;
  location: Location;
}) => {
  const dispatch = useDispatch();
  const previousValue = usePrevious(value) ?? null;
  const hashOptions = parseHashOptions(location.hash);
  const hashValue = (hashOptions[key] ?? null) as Value | null;

  const defaultValue = getDefaultDisplayOption<Value, Key>(key);

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
