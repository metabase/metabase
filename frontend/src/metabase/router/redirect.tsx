import type { ComponentType } from "react";

import { Navigate } from "./Navigate";
import { type PlainRoute, formatPattern } from "./react-router";
import { useRouter } from "./use-router";

type RouteParams = Record<string, string | undefined>;

/**
 * Reproduces react-router v3's `<Redirect>` as a v7-style redirecting component.
 * Mounted as a route `component`, it interpolates `:params` and the `*` splat
 * into `to`, resolves a relative `to` against the parent route (using v3's own
 * matched-route resolution, so encoding and splats behave identically), and
 * preserves the current query string and history state (dropping the hash, as v3
 * did). It collapses to a bare `<Navigate>` once the engine swap supplies native
 * relative resolution.
 */
export function redirect(to: string): ComponentType {
  return function RedirectRoute(): JSX.Element {
    const { routes, params, location } = useRouter();
    const pathname = resolveTarget(to, routes, params);

    return (
      <Navigate
        to={{ pathname, search: location.search }}
        state={location.state}
        replace
      />
    );
  };
}

/**
 * The redirect target, computed the way v3's `<Redirect>` did in its `onEnter`:
 * an absolute `to` is filled directly, a relative one is resolved against the
 * pattern of the parent of the matched (leaf) redirect route.
 */
function resolveTarget(
  to: string,
  routes: PlainRoute[],
  params: RouteParams,
): string {
  if (to.startsWith("/")) {
    return formatPattern(to, params);
  }
  const parentPattern = getRoutePattern(routes, routes.length - 2);
  const pattern = parentPattern.replace(/\/*$/, "/") + to;
  return formatPattern(pattern, params);
}

/**
 * The absolute pattern up to and including `routes[routeIndex]`, walking parents
 * until an absolute segment. Ported from v3's `Redirect.getRoutePattern`.
 */
function getRoutePattern(routes: PlainRoute[], routeIndex: number): string {
  let parentPattern = "";

  for (let i = routeIndex; i >= 0; i--) {
    const pattern = routes[i].path || "";

    parentPattern = pattern.replace(/\/*$/, "/") + parentPattern;

    if (pattern.indexOf("/") === 0) {
      break;
    }
  }

  return "/" + parentPattern;
}
