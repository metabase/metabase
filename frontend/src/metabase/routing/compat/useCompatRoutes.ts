import type { InjectedRouter, PlainRoute, Route } from "react-router";
import { useMatches as useMatchesV7 } from "react-router-dom";

import { useRouter } from "metabase/router";

import { USE_REACT_ROUTER_V7 } from "./config";

interface RouterContextResult {
  /**
   * The router object (v3 only, undefined in v7)
   */
  router: InjectedRouter | undefined;
  /**
   * The current matched route (v3 only, undefined in v7)
   * This is the innermost matched route, used for setRouteLeaveHook
   */
  route: Route | undefined;
  /**
   * All matched routes from root to current
   */
  routes: PlainRoute[];
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
  if (USE_REACT_ROUTER_V7) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRouterContextV7();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useRouterContextV3();
}

function useRouterContextV7(): RouterContextResult {
  const matches = useMatchesV7();

  // Convert v7 matches to v3-like routes structure
  const routes: PlainRoute[] = matches.map((match) => ({
    path: match.pathname,
  }));

  return {
    router: undefined,
    route: undefined,
    routes,
  };
}

function useRouterContextV3(): RouterContextResult {
  const { router, routes } = useRouter();

  // The innermost route is the last one in the routes array
  const route = routes?.[routes.length - 1] as Route | undefined;

  return {
    router,
    route,
    routes: routes || [],
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
export function useCompatRoutes(): PlainRoute[] {
  const { routes } = useRouterContext();
  return routes;
}
