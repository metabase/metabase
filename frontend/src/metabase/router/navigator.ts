import type { NavigateFunction, NavigateOptions, To } from "react-router";

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
