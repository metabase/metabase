import { useContext } from "react";
import { UNSAFE_NavigationContext, useNavigation } from "react-router";

/**
 * Whether the router is part-way through a navigation it has not committed yet.
 *
 * A `route.lazy` route resolves its module before committing the location, which
 * opens a window where the old page is still mounted at the old URL while the
 * router is already on its way somewhere else. Anything that navigates in that
 * window replaces the pending navigation rather than queueing behind it, and the
 * destination the user asked for is lost.
 *
 * Effects that keep a URL in sync with state have to sit that window out. See
 * `useDashboardUrlQuery`, which already does the same for a navigation held by a
 * leave prompt.
 *
 * Returns `false` outside a router, where nothing can be pending. Much of the app
 * is shared with the SDK, which mounts none (see `useMaybeLocation`).
 */
export function useIsNavigating(): boolean {
  const hasRouter = useContext(UNSAFE_NavigationContext) != null;

  // react-router's hook throws when there is no router, so it can only be called
  // on the branch that has one. Safe despite the rule: a router appearing above a
  // mounted component would change the tree shape and remount it, so `hasRouter`
  // cannot flip between renders of the same mount.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return hasRouter ? useNavigation().state !== "idle" : false;
}
