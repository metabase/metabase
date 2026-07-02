import { useMemo } from "react";

import type { Location } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useLocation`, implemented over the v3 location injected
 * into the router context (mirrored into redux `state.routing`).
 */
export function useLocation(): Location {
  const { location } = useRouter();

  return useMemo(
    () => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state,
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
