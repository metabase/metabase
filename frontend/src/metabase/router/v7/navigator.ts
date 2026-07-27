import type { NavigateFunction, NavigateOptions, To } from "react-router";

import type { RouterNavigator } from "../middleware";
import type { Location as HistoryLocation, LocationDescriptor } from "../types";

import { queryToSearch } from "./location";

/**
 * The live v7 `navigate`, registered by `V7RouterBridge` once the router mounts.
 * The redux navigator adapter is built at store creation, before the router
 * exists, so it reads `navigate` through this holder rather than capturing it.
 */
let currentNavigate: NavigateFunction | null = null;

/**
 * Navigations requested before the router registered its `navigate`. On v3 the
 * history existed at store creation, so a `dispatch(replace(...))` from a mount
 * `useLayoutEffect` (e.g. a guard redirect) took effect immediately. v7's
 * `navigate` only registers in an effect, which runs after descendant layout
 * effects, so buffer these and flush them once it does rather than dropping them.
 */
let pendingNavigations: Array<(navigate: NavigateFunction) => void> = [];

export function setV7Navigate(navigate: NavigateFunction | null): void {
  currentNavigate = navigate;
  if (!navigate) {
    // The router unmounted. Anything still buffered was meant for it, not for
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
 * `router.listen` had no v7 equivalent, so `V7RouterBridge` fans every location
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
 * Turn a v3 `LocationDescriptor` (string or `{ pathname, search, hash, state }`)
 * into v7 `navigate(to, options)` arguments. Shared by the imperative-router
 * shim and the redux navigator so both map descriptors the same way.
 */
export function toNavigateArgs(
  location: LocationDescriptor,
  options: NavigateOptions = {},
): [To, NavigateOptions] {
  if (typeof location === "string") {
    return [location, options];
  }
  // v3 descriptors carry the query as a `query` object, which v7 does not read, so
  // serialize it into the search string. Dropping it silently loses params (e.g.
  // the dashboard's tab and filter slugs). `query` wins over `search`, matching
  // history@3's `useQueries`: callers build `{ ...location, query }`, so the
  // spread's stale `search` must not shadow the query they just set.
  const search = location.query
    ? queryToSearch(location.query)
    : location.search;
  return [
    {
      pathname: location.pathname,
      search,
      hash: location.hash,
    },
    { ...options, state: location.state },
  ];
}

/**
 * A `RouterNavigator` (the subset of `history` that `routerMiddleware` drives)
 * backed by the live v7 `navigate`. Passed to the store on v7 so
 * `dispatch(push(...))` navigates the v7 router. A call before the router mounts
 * is buffered and flushed on registration, so a mount-time redirect is not lost.
 */
export function createV7Navigator(): RouterNavigator {
  const navigate = (to: To | number, options?: NavigateOptions) => {
    const run = (fn: NavigateFunction) =>
      typeof to === "number" ? fn(to) : fn(to, options);
    if (currentNavigate) {
      run(currentNavigate);
    } else {
      pendingNavigations.push(run);
    }
  };

  return {
    push: (location) => navigate(...toNavigateArgs(location)),
    replace: (location) =>
      navigate(...toNavigateArgs(location, { replace: true })),
    go: (n) => navigate(n),
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
  };
}
