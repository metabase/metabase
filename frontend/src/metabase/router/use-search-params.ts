import { useCallback, useMemo, useRef } from "react";

import type { SetURLSearchParams, URLSearchParamsInit } from "./types";
import { useLocation } from "./use-location";
import { useNavigate } from "./use-navigate";
import { createSearchParams, getSearchParamsForLocation } from "./utils";

/**
 * react-router v7's `useSearchParams`, implemented over the v3 location's query
 * string. Returns a `URLSearchParams` view plus a setter that navigates to the
 * current path with the updated query string (a push by default).
 *
 * Like v7, the setter navigates to search only, so any existing hash is dropped.
 * v7 does this by navigating to `"?" + params`, which resolves to the current
 * path with an empty hash.
 *
 * `defaultInit` fills in keys the current URL is missing, matching v7. As in v7,
 * the defaults are captured once and stop being merged once `setSearchParams`
 * has been called, so a value can then be removed with `setSearchParams({})`.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useSearchParams
 */
export function useSearchParams(
  defaultInit?: URLSearchParamsInit,
): readonly [URLSearchParams, SetURLSearchParams] {
  const location = useLocation();
  const navigate = useNavigate();

  const defaultSearchParamsRef = useRef(createSearchParams(defaultInit));
  const hasSetSearchParamsRef = useRef(false);

  const searchParams = useMemo(
    () =>
      getSearchParamsForLocation(
        location.search,
        hasSetSearchParamsRef.current ? null : defaultSearchParamsRef.current,
      ),
    [location.search],
  );

  const setSearchParams = useCallback<SetURLSearchParams>(
    (nextInit, navigateOptions) => {
      const params = createSearchParams(
        typeof nextInit === "function"
          ? // Hand the updater a clone so it cannot mutate the instance the
            // component currently holds (matching v7).
            nextInit(new URLSearchParams(searchParams))
          : nextInit,
      );
      hasSetSearchParamsRef.current = true;
      const search = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
        },
        navigateOptions,
      );
    },
    [navigate, location.pathname, searchParams],
  );

  return [searchParams, setSearchParams] as const;
}
