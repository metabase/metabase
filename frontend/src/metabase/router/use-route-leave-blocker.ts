import { useContext, useId, useRef } from "react";
import type { Blocker, BlockerFunction } from "react-router";
import { UNSAFE_RouteContext } from "react-router";

import { useGuardedBlocker } from "./route-leave-guards";

export { useIsNavigationHeld } from "./route-leave-guards";

/**
 * Block navigation that leaves the route this component renders in, replacing
 * v3's `router.setRouteLeaveHook(route, hook)`.
 *
 * `shouldBlock` decides per navigation. A blocked navigation is parked rather
 * than cancelled: the returned blocker reports `state === "blocked"` and carries
 * the attempted destination, and `proceed()` lets it through while `reset()`
 * drops it. So the caller no longer re-issues the navigation itself.
 *
 * The scope is the route's matched pathname, so a destination that stays inside
 * that route does not block, matching v3's `listenBeforeLeavingRoute`. Callers
 * do not pass the route in: v7 publishes the matched branch, so the scope is
 * read here rather than threaded through props.
 *
 * Guards nest. Several can be mounted at once, the innermost one that blocks
 * gets the prompt, and letting it through asks the rest before the navigation
 * resumes.
 *
 * @see https://reactrouter.com/7.18.1/api/hooks/useBlocker
 */
export function useRouteLeaveBlocker(shouldBlock: BlockerFunction): Blocker {
  const id = useId();
  const basePath = useRoutePathname();

  // `shouldBlock` closes over state that changes every render (whether the page
  // is dirty). Read it through a ref so the registration stays put: re-running
  // it would drop the guard for the moment a navigation could land in.
  const latestShouldBlock = useRef(shouldBlock);
  latestShouldBlock.current = shouldBlock;

  return useGuardedBlocker(id, latestShouldBlock, basePath);
}

/**
 * The matched pathname of the route this component renders in.
 */
export function useRoutePathname(): string | undefined {
  const { matches } = useContext(UNSAFE_RouteContext);
  return matches.at(-1)?.pathname;
}
