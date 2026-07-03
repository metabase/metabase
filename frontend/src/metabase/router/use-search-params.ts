import { useCallback, useMemo } from "react";

import type { SetURLSearchParams } from "./types";
import { useLocation } from "./use-location";
import { useNavigate } from "./use-navigate";
import { createSearchParams } from "./utils";

/**
 * react-router v7's `useSearchParams`, implemented over the v3 location's query
 * string. Returns a `URLSearchParams` view plus a setter that navigates to the
 * same path with the updated query string (a push by default).
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useSearchParams
 */
export function useSearchParams(): readonly [
  URLSearchParams,
  SetURLSearchParams,
] {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
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
      const search = params.toString();
      navigate(
        {
          pathname: location.pathname,
          hash: location.hash,
          search: search ? `?${search}` : "",
        },
        navigateOptions,
      );
    },
    [navigate, location.pathname, location.hash, searchParams],
  );

  return [searchParams, setSearchParams] as const;
}
