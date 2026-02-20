import { useMemo } from "react";
import {
  type Location as LocationV7,
  useLocation as useLocationV7,
  useSearchParams as useSearchParamsV7,
} from "react-router-dom";

import { useNavigation } from "./useNavigation";

/**
 * Location shape used throughout the app.
 * It extends Router's location with query helpers.
 */
export interface RouterLocation extends LocationV7 {
  // Query object for legacy call sites.
  query: Record<string, string>;
  // URLSearchParams for modern call sites.
  searchParams: URLSearchParams;
  // Kept for legacy compatibility.
  action: "PUSH" | "REPLACE" | "POP";
}

export const useLocationWithQuery = (): RouterLocation => {
  const location = useLocationV7();
  const [searchParams] = useSearchParamsV7();

  const query = useMemo(() => {
    const result: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [searchParams]);

  return useMemo(
    () => ({
      ...location,
      query,
      searchParams,
      action: "PUSH" as const,
    }),
    [location, query, searchParams],
  );
};

/**
 * Hook for accessing and updating search params.
 *
 * Usage:
 * ```tsx
 * const [searchParams, setSearchParams] = useSearchParamsWithNavigation();
 *
 * // Read a param
 * const tab = searchParams.get('tab');
 *
 * // Update params
 * setSearchParams({ tab: 'settings' });
 * ```
 */
export const useSearchParamsWithNavigation = (): [
  URLSearchParams,
  (params: Record<string, string | undefined>) => void,
] => {
  const location = useLocationWithQuery();
  const { replace } = useNavigation();

  const setSearchParams = (params: Record<string, string | undefined>) => {
    const newSearchParams = new URLSearchParams(location.searchParams);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    const search = newSearchParams.toString();
    replace({
      pathname: location.pathname,
      search: search ? `?${search}` : "",
      hash: location.hash,
    });
  };

  return [location.searchParams, setSearchParams];
};
