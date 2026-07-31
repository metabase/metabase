import { useContext, useState } from "react";
import { UNSAFE_RouteContext, useLocation, useParams } from "react-router";

import { Navigate } from "./Navigate";

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
    .replace(/\*/g, () => params["*"] ?? "");
}

/**
 * The matched pathname of the parent of the route this redirect renders in.
 * A relative `to` resolves against it, which is where v3's `<Redirect>` resolved
 * from and is one route shallower than v7 would resolve a relative `<Navigate>`.
 *
 * Read off the route context rather than `useMatches`, which is data-router only.
 */
function useParentPathname(): string {
  const { matches } = useContext(UNSAFE_RouteContext);
  return matches.at(-2)?.pathname ?? "/";
}

function RedirectRoute({ to }: { to: string }): JSX.Element {
  const parentPathname = useParentPathname();
  const params = useParams();
  const location = useLocation();

  // Resolve the target once, from the match this redirect was rendered into.
  // The match updates as soon as the redirect fires, so a later render (before
  // this component unmounts) would resolve a relative `to` against the
  // already-changed, deeper location. v3's <Redirect> computed its target once
  // in `onEnter`, so freeze it here to match.
  const [target] = useState(() => ({
    pathname: to.startsWith("/")
      ? formatPattern(to, params)
      : parentPathname.replace(/\/*$/, "/") + formatPattern(to, params),
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
 * parent route, and preserves the current query string and history state
 * (dropping the hash, as v3 did).
 */
export function redirect(to: string): JSX.Element {
  return <RedirectRoute to={to} />;
}
