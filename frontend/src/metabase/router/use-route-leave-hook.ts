import { useContext, useEffect, useRef } from "react";
import { UNSAFE_RouteContext } from "react-router";

import type { RouteHook } from "./types";
import { registerLeaveHook } from "./v7/blocking-history";

/**
 * Register a hook that runs before a navigation leaves the route this component
 * renders in, replacing v3's `router.setRouteLeaveHook(route, hook)`. Returning
 * `false` cancels the navigation.
 *
 * The hook is scoped to the route's matched pathname, so it does not fire for a
 * destination that stays inside that route, matching v3's
 * `listenBeforeLeavingRoute`.
 *
 * Callers no longer pass the route in. v3 had to inject it because only the
 * route object knew its own pattern; v7 publishes the matched branch, so the
 * scope is read here instead of threaded through props.
 *
 * Replaced by native `useBlocker` once the data router hosts the app (DEV-2375).
 */
export function useRouteLeaveHook(hook: RouteHook): void {
  const basePath = useRoutePathname();

  // The hook closes over state that changes every render (whether the page is
  // dirty, whether the user already confirmed). Read it through a ref so the
  // registration survives those renders: re-registering would drop the hook for
  // the moment a navigation could land in.
  const latestHook = useRef(hook);
  latestHook.current = hook;

  useEffect(
    () =>
      registerLeaveHook(
        (location, navigationType) =>
          latestHook.current(location, navigationType),
        basePath,
      ),
    [basePath],
  );
}

/**
 * The matched pathname of the route this component renders in. Changes whenever
 * the component is reused across a navigation that re-matched its route, which
 * is what the leave-confirm state keys its reset on.
 */
export function useRoutePathname(): string | undefined {
  const { matches } = useContext(UNSAFE_RouteContext);
  return matches.at(-1)?.pathname;
}
