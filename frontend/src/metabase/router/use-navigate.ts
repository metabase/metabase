import { useCallback, useRef } from "react";

import { getRoutePathnames, resolveTo } from "./resolve-to";
import type { NavigateFunction, NavigateOptions, To } from "./types";
import { useRouter } from "./use-router";

/**
 * react-router v7's `useNavigate`, implemented over react-router v3's imperative
 * router (`router.push/replace/go`).
 *
 * - `navigate(to, { replace?, state?, relative? })` pushes (or replaces) the location.
 * - `navigate(delta)` moves through the history stack (e.g. `navigate(-1)`).
 *
 * A relative `to` (`".."`, `"child"`) resolves against the matched route branch,
 * which v3 does not do on its own. The branch comes from the router context, so
 * it always ends at the deepest matched route: unlike v7, a component rendered
 * by a parent route resolves `".."` as if it sat in the leaf route. Nothing
 * relies on that today, and the route context added with the engine swap removes
 * the difference.
 *
 * The returned function gets a new identity whenever the pathname changes, like
 * v7 (whose callback depends on the current pathname). Keeping it stable would
 * be nicer, but it would diverge: a mounted `<Navigate>` would stop re-asserting
 * its target, and effects keyed on `navigate` would run a different number of
 * times, so code written against the facade would behave differently after the
 * swap.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useNavigate
 */
export function useNavigate(): NavigateFunction {
  const { router, location, routes } = useRouter();

  // Read through a ref rather than listed as a dependency: v3 rebuilds `routes`
  // on every transition, including a push to the pathname already showing. As a
  // dependency it would hand back a new `navigate` after such a push, so a
  // mounted `<Navigate>` would re-run its effect and push its target forever.
  const routesRef = useRef(routes);
  routesRef.current = routes;

  return useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      if (typeof to === "number") {
        router.go(to);
        return;
      }

      const path = resolveTo(
        to,
        getRoutePathnames(routesRef.current),
        location.pathname,
        options.relative === "path",
      );
      const descriptor = { ...path, state: options.state };

      if (options.replace) {
        router.replace(descriptor);
      } else {
        router.push(descriptor);
      }
    },
    [router, location.pathname],
  );
}
