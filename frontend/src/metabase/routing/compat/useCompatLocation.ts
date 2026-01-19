import type { Location as HistoryLocation } from "history";
import { useMemo } from "react";
import {
  useLocation as useLocationV7,
  useSearchParams as useSearchParamsV7,
  type Location as LocationV7,
} from "react-router-dom";

import { useRouter } from "metabase/router";

import { USE_V7_LOCATION } from "./config";

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
  action?: "PUSH" | "REPLACE" | "POP";
}

/**
 * Compatibility hook for accessing location that works with both React Router v3 and v7.
 *
 * During migration:
 * - When USE_V7_LOCATION is false, uses the custom useRouter hook (v3)
 * - When USE_V7_LOCATION is true, uses react-router-dom v7 useLocation
 *
 * The returned location object includes both v3-style `query` object
 * and v7-style properties for gradual migration.
 *
 * Usage:
 * ```tsx
 * const location = useCompatLocation();
 *
 * // Access pathname
 * console.log(location.pathname);
 *
 * // Access search params (v7 style - preferred)
 * const tab = location.searchParams.get('tab');
 *
 * // Access query params (v3 style - deprecated)
 * const tab = location.query.tab;
 * ```
 */
export const useCompatLocation = (): CompatLocation => {
  if (USE_V7_LOCATION) {
    return useLocationV7Compat();
  }
  return useLocationV3Compat();
};

/**
 * v7 implementation - uses useLocation and useSearchParams from react-router-dom
 */
function useLocationV7Compat(): CompatLocation {
  const location = useLocationV7();
  const [searchParams] = useSearchParamsV7();

  // Create v3-compatible query object from searchParams
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
    }),
    [location, query, searchParams],
  );
}

/**
 * v3 implementation - uses the existing useRouter hook
 */
function useLocationV3Compat(): CompatLocation {
  const { location } = useRouter();

  // Create URLSearchParams from v3 location
  const searchParams = useMemo(() => {
    const search = location?.search || "";
    return new URLSearchParams(search);
  }, [location?.search]);

  // Create query object from search string
  const query = useMemo(() => {
    const result: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [searchParams]);

  const v3Location = location as HistoryLocation | undefined;

  return useMemo(
    () => ({
      pathname: v3Location?.pathname || "",
      search: v3Location?.search || "",
      hash: v3Location?.hash || "",
      state: v3Location?.state ?? null,
      key: v3Location?.key || "default",
      query,
      searchParams,
    }),
    [v3Location, query, searchParams],
  );
}

/**
 * Hook for accessing and updating search params.
 * Provides a unified API for both v3 and v7.
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

  // Import navigation for updating
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useNavigation } = require("./useNavigation");
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
