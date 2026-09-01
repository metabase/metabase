import { useState } from "react";
import { Navigate, generatePath, useLocation, useParams } from "react-router";

function RedirectRoute({ to }: { to: string }): JSX.Element {
  const params = useParams();
  const location = useLocation();

  // Resolve the target once, from the match this redirect was rendered into.
  // The match updates as soon as the redirect fires, so a later render (before
  // this component unmounts) would interpolate the already-changed params.
  const [target] = useState(() => ({
    pathname: generatePath(to, params),
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
 * A redirecting route element, used as `<Route path="x" element={redirect("y")} />`.
 * It interpolates the matched `:params` and the `*` splat into `to`, and carries
 * the current query string and history state over. The hash is dropped.
 *
 * A relative `to` resolves the way react-router resolves a relative `<Navigate>`,
 * against the route this element renders in, so `..` steps up one route. An index
 * route contributes no path, so its target is already parent relative.
 */
export function redirect(to: string): JSX.Element {
  return <RedirectRoute to={to} />;
}
