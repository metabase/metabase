import { useLayoutEffect, useState } from "react";
import {
  type DataRouter,
  RouterProvider as ReactRouterProvider,
  type RouteObject,
} from "react-router";

import { getBasename } from "metabase/utils/basename";

import {
  type MemoryTestRouterHolder,
  createAppRouter,
  createMemoryAppRouter,
} from "./create-router";
import type { LocationMirror } from "./location-mirror";

/**
 * Mirrors every location out to `onLocationChange`, which is how the app emits
 * LOCATION_CHANGE on navigation (see `createLocationMirror`). Replaces v3's
 * `syncHistoryWithStore`.
 *
 * Subscribing to the router rather than reading the rendered location matters
 * because v3 dispatched LOCATION_CHANGE as part of the transition rather than
 * after a render. Thunks read the store synchronously right after navigating, so
 * a store that lags a render makes them push a stale location and clobber query
 * params that were just set.
 */
function useLocationMirror(
  router: DataRouter,
  onLocationChange?: LocationMirror,
): void {
  useLayoutEffect(() => {
    if (!onLocationChange) {
      return;
    }
    // The router notifies its subscribers on every state update, not only on a
    // location change, and replays the state it initialized with to the first
    // subscriber. Key on the location so neither is mirrored twice.
    let lastKey: string | null = null;

    const mirror = ({ location }: DataRouter["state"]) => {
      if (location.key === lastKey) {
        return;
      }
      lastKey = location.key;
      onLocationChange(location);
    };

    mirror(router.state);
    return router.subscribe(mirror);
  }, [router, onLocationChange]);
}

/**
 * Hosts the app as a data router. The whole route tree goes in as real data
 * routes, so there is no descendant `<Routes>` left. No route has a loader,
 * `lazy`, or middleware yet: adding those per subtree is what DEV-2291 does from
 * here.
 *
 * `useTransitions={false}` keeps navigation committing synchronously.
 * react-router otherwise marks its own location update as a transition, which in
 * a production React build deprioritises it so it can commit long after the click
 * that caused it. v3 navigated synchronously, and the app was written against
 * that: a navigation that lands mid-interaction remounts whatever is on screen,
 * which silently discarded state such as the text typed into a modal that was
 * opened right after clicking a link.
 *
 * `onLocationChange` is how the location reaches redux: the app passes
 * `createLocationMirror(store.dispatch)`, so the router itself stays unaware of
 * the store. The `isNavbarOpen` and `errorPage` reducers and trace-id rotation
 * all react to the LOCATION_CHANGE it emits.
 */
export function RouterProvider({
  routes,
  onLocationChange,
}: {
  routes: RouteObject[];
  onLocationChange?: LocationMirror;
}): JSX.Element {
  const [router] = useState(() =>
    createAppRouter(routes, getBasename() || undefined),
  );
  useLocationMirror(router, onLocationChange);

  return <ReactRouterProvider router={router} useTransitions={false} />;
}

/**
 * The same host on an in-memory history, for tests. Mirrors what
 * `renderWithProviders({ withRouter: true })` mounts, including navigation
 * blocking. Pass `routerHolder` to drive and inspect the router from outside the
 * tree.
 */
export function RouterProviderMemory({
  routes,
  initialRoute,
  basename,
  routerHolder,
  onLocationChange,
}: {
  routes: RouteObject[];
  initialRoute: string;
  basename?: string;
  routerHolder?: MemoryTestRouterHolder;
  onLocationChange?: LocationMirror;
}): JSX.Element {
  const [router] = useState(() => {
    const created = createMemoryAppRouter(routes, initialRoute, basename);
    if (routerHolder) {
      routerHolder.current = created;
    }
    return created;
  });
  useLocationMirror(router, onLocationChange);

  return <ReactRouterProvider router={router} useTransitions={false} />;
}
