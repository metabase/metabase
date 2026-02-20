import { useMatches as useMatchesV7 } from "react-router-dom";

import type {
  CompatInjectedRouter,
  CompatPlainRoute,
  CompatRoute,
} from "./types";

interface RouterContextResult {
  /**
   * The router object (v3 only, undefined in v7)
   */
  router: CompatInjectedRouter | undefined;
  /**
   * The current matched route (v3 only, undefined in v7)
   * This is the innermost matched route, used for setRouteLeaveHook
   */
  route: CompatRoute | undefined;
  /**
   * All matched routes from root to current
   */
  routes: CompatPlainRoute[];
}

/**
 * Hook to access the router context for v3 compatibility.
 *
 * In v3 mode, provides the router and route objects needed for
 * features like setRouteLeaveHook.
 *
 * In v7 mode, router and route are undefined as they don't exist.
 * Use useBlocker from react-router-dom instead.
 */
export function useRouterContext(): RouterContextResult {
  return useRouterContextV7();
}

function useRouterContextV7(): RouterContextResult {
  const matches = useMatchesV7();

  // Convert v7 matches to v3-like routes structure
  const routes: CompatPlainRoute[] = matches.map((match) => ({
    path: match.pathname,
  }));

  return {
    router: undefined,
    route: undefined,
    routes,
  };
}

/**
 * Hook to access matched routes.
 *
 * Returns an array of route objects from root to the current matched route.
 * In v3, these are PlainRoute objects. In v7, they're converted from matches.
 *
 * Usage:
 * ```tsx
 * const routes = useCompatRoutes();
 * const disableFeature = routes.some(r => r.disableFeature);
 * ```
 */
export function useCompatRoutes(): CompatPlainRoute[] {
  const { routes } = useRouterContext();
  return routes;
}
