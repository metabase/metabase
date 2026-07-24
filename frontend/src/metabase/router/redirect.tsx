import { useState } from "react";

import { Navigate } from "./Navigate";
import type { PlainRoute } from "./types";
import { useRouter } from "./use-router";

type RouteParams = Record<string, string | undefined>;

/**
 * Interpolate a route pattern's `:params` and `*` splat with the matched values,
 * replacing v3's `formatPattern`. Params are re-encoded, matching v3, so a
 * segment that arrived encoded (`1%3APUBLIC`) stays encoded rather than doubling
 * the path. Only the pattern syntax the app uses (`:name`, `*`) is handled; v3's
 * optional groups are gone from the route tree.
 */
function formatPattern(pattern: string, params: RouteParams): string {
  return pattern
    .replace(/:([A-Za-z0-9_]+)\??/g, (_, name) =>
      encodeURIComponent(params[name] ?? ""),
    )
    .replace(/\*/g, () => params.splat ?? "");
}

function RedirectRoute({ to }: { to: string }): JSX.Element {
  const { routes, params, location } = useRouter();

  // Resolve the target once, from the match this redirect was rendered into.
  // The router context is shared and updates as soon as the redirect fires, so
  // a later render (before this component unmounts) would resolve a relative
  // `to` against the already-changed, deeper location. v3's <Redirect> computed
  // its target once in `onEnter`, so freeze it here to match.
  const [target] = useState(() => ({
    pathname: resolveTarget(to, routes, params),
    search: location.search,
    state: location.state,
  }));

  return (
    <Navigate
      to={{ pathname: target.pathname, search: target.search }}
      state={target.state}
      replace
    />
  );
}

/**
 * Reproduces react-router v3's `<Redirect>` as a v7-style redirecting route
 * element. Used as `<Route path="x" element={redirect("y")} />`, it interpolates
 * `:params` and the `*` splat into `to`, resolves a relative `to` against the
 * parent route (using v3's own matched-route resolution, so encoding and splats
 * behave identically), and preserves the current query string and history state
 * (dropping the hash, as v3 did). It collapses to a bare `<Navigate>` once the
 * engine swap supplies native relative resolution.
 */
export function redirect(to: string): JSX.Element {
  return <RedirectRoute to={to} />;
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
