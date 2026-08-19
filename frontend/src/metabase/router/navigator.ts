import type {
  DataRouter,
  NavigateFunction,
  NavigateOptions,
  To,
} from "react-router";

import type { Location as HistoryLocation } from "./types";

/**
 * The live `navigate`, registered by the host's `AppShell` once the router
 * mounts. Non-component callers reach it through `navigate` below, which reads
 * this holder rather than capturing it: they run outside React, and much of the
 * app is constructed before the router exists.
 */
let currentNavigate: NavigateFunction | null = null;

/**
 * Navigations requested before the router registered its `navigate`. A
 * navigation from a mount `useLayoutEffect` (e.g. a guard redirect) is requested
 * before `AppShell`'s effect runs, since layout effects run first, so hold these
 * and flush them on registration rather than dropping them.
 *
 * They are held as a queue, not as a single latest value, so the history stack
 * ends up the way it would have without the registration gap. Collapsing a push
 * and a following replace into just the replace would overwrite the entry the
 * user arrived on rather than the intermediate one.
 */
let pendingNavigations: Array<(navigate: NavigateFunction) => void> = [];

/**
 * Whether a router is on its way. `createAppRouter` and `createMemoryAppRouter`
 * set this, because both put an `AppShell` above the tree and so guarantee a
 * registration.
 *
 * A host that builds no router never registers a `navigate`, so anything held
 * for it is held for the life of the page. The SDK is such a host and runs for a
 * long time. Holding nothing until a router is on its way keeps that queue from
 * retaining every closure, and the `state` each one captures.
 */
let isRouterExpected = false;

export function setRouterExpected(expected: boolean): void {
  isRouterExpected = expected;
}

/**
 * The live router, registered as it is built. Only `getIsNavigationPending`
 * reads it, and only for state react-router publishes nowhere else outside a
 * component.
 */
let currentRouter: DataRouter | null = null;

export function setRouter(router: DataRouter | null): void {
  currentRouter = router;
}

/**
 * Whether the router has accepted a navigation it has not committed yet.
 *
 * `useIsNavigating` answers the same question during a render. This is for the
 * callers that cannot hold a hook, the same ones `navigate` below exists for.
 *
 * A `route.lazy` destination is what makes the window real: the router resolves
 * the module before it commits the location, so the old page stays mounted at
 * the old URL. Anything that navigates in that window replaces the pending
 * navigation rather than queueing behind it, and the destination the user asked
 * for is dropped. Effects that mirror state into the URL have to sit it out.
 *
 * Read from the router rather than tracked alongside it, because the router
 * updates this synchronously and a React render does not: a caller navigating
 * from a promise callback can run again before anything re-renders. It is
 * precise in the other direction too. A navigation to a route that is already
 * loaded commits during the call, so the window is never open for one, and a
 * URL sync that follows it still runs.
 */
export function getIsNavigationPending(): boolean {
  return (
    currentRouter != null && currentRouter.state.navigation.state !== "idle"
  );
}

/**
 * The pathname of the navigation the router has accepted but not committed, or
 * null when none is pending.
 *
 * Callers that only want to avoid clobbering a navigation to a *different*
 * destination need the target, not just whether one is pending: a pending
 * navigation to the same path they are about to write is theirs to keep, not a
 * redirect to sit out. Under React 19 the pending window stays open across the
 * lazy chunk load a render longer, so a blanket "is anything pending" check
 * drops legitimate same-destination URL syncs.
 */
export function getPendingNavigationPath(): string | null {
  return currentRouter?.state.navigation.location?.pathname ?? null;
}

export function setRouterNavigate(navigate: NavigateFunction | null): void {
  currentNavigate = navigate;
  if (!navigate) {
    // The router unmounted. Anything still held was meant for it, not for
    // whatever router mounts next, so drop it rather than replay it later.
    pendingNavigations = [];
    return;
  }
  if (pendingNavigations.length > 0) {
    const flushing = pendingNavigations;
    pendingNavigations = [];
    for (const run of flushing) {
      run(navigate);
    }
  }
}

/**
 * Subscribers to location changes, backing the imperative router's `listen`. v3's
 * `router.listen` had no v7 equivalent, so the router mirror fans every location
 * change out to these on the app's behalf (e.g. `use-dashboard-url-query`).
 */
type LocationListener = (location: HistoryLocation) => void;
const locationListeners = new Set<LocationListener>();

export function subscribeLocation(listener: LocationListener): () => void {
  locationListeners.add(listener);
  return () => {
    locationListeners.delete(listener);
  };
}

export function notifyLocationListeners(location: HistoryLocation): void {
  // Snapshot so a listener that unsubscribes mid-run cannot skip a sibling.
  for (const listener of [...locationListeners]) {
    listener(location);
  }
}

/**
 * `useNavigate`, for code that cannot call a hook: thunks, redux middleware,
 * reducers, and the permission and visualization config objects. Same signature
 * and same behaviour, with two differences that follow from having no component
 * to anchor to.
 *
 * A relative target resolves from the root, because `AppShell` sits on a
 * pathless layout route (see there). A component's `useNavigate` resolves
 * against its own deepest match instead, so a caller moving between the two must
 * spell an absolute path.
 *
 * A call before the router mounts is held and flushed on registration, so a
 * mount-time redirect is not lost. Where the host builds no router at all, the
 * call is a no-op and nothing is retained.
 *
 * Prefer `useNavigate` wherever there is a component to hold it.
 */
export function navigate(to: To, options?: NavigateOptions): void;
export function navigate(delta: number): void;
export function navigate(to: To | number, options?: NavigateOptions): void {
  const run = (fn: NavigateFunction) =>
    typeof to === "number" ? fn(to) : fn(to, options);

  if (currentNavigate) {
    run(currentNavigate);
  } else if (isRouterExpected) {
    pendingNavigations.push(run);
  }
}
