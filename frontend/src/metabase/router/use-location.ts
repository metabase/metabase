import { useMemo } from "react";

import type { Location } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useLocation`, implemented over the location injected into
 * the router context (mirrored into redux `state.routing`). Returns the pure v7
 * `Location` shape (no v3 `query`/`action` fields); the legacy compat `Location`
 * type carries those for the route-prop call sites.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useLocation
 */
export function useLocation(): Omit<Location, "query" | "action"> {
  const { location } = useRouter();

  return useMemo(
    () => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      // v3 leaves state `undefined` when absent, v7 uses `null`.
      state: location.state ?? null,
      key: location.key,
    }),
    [
      location.pathname,
      location.search,
      location.hash,
      location.state,
      location.key,
    ],
  );
}
