import { useMemo } from "react";
import {
  type Location as LocationV7,
  useLocation as useLocationV7,
  useSearchParams as useSearchParamsV7,
} from "react-router-dom";

import { useNavigation } from "./useNavigation";

/**
 * Extended location type that includes both v3 and v7 properties
 * for backward compatibility during migration.
 */
export interface CompatLocation extends LocationV7 {
  // v3-style query object (deprecated, use searchParams instead)
  query: Record<string, string>;
  // v7-style URLSearchParams
  searchParams: URLSearchParams;
  // v3-style action (for compatibility)
  action: "PUSH" | "REPLACE" | "POP";
}

export const useCompatLocation = (): CompatLocation => {
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
 * const [searchParams, setSearchParams] = useCompatSearchParams();
 *
 * // Read a param
 * const tab = searchParams.get('tab');
 *
 * // Update params
 * setSearchParams({ tab: 'settings' });
 * ```
 */
export const useCompatSearchParams = (): [
  URLSearchParams,
  (params: Record<string, string | undefined>) => void,
] => {
  const location = useCompatLocation();
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
