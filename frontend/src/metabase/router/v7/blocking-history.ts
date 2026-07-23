import {
  type HistoryRouterProps,
  type To,
  type Location as V7Location,
  UNSAFE_createBrowserHistory as createBrowserHistory,
  parsePath,
} from "react-router-v7";

import type { Location as HistoryLocation } from "../types";

import { toV3Location } from "./location";

// react-router does not export the `History` interface directly, so pull it off
// the history prop of `unstable_HistoryRouter`, which is exactly the type the
// router accepts and the blocking wrapper returns.
type History = HistoryRouterProps["history"];

/**
 * A route-leave hook, matching v3's `setRouteLeaveHook` callback: it receives
 * the attempted destination and returns `false` to cancel the navigation.
 */
type LeaveHook = (nextLocation?: HistoryLocation) => unknown;

interface Registration {
  hook: LeaveHook;
  // The matched pathname of the guarded route. v3's `setRouteLeaveHook` is scoped
  // to a route and only fires when a navigation leaves that route's subtree, so a
  // hook with a base path does not fire for destinations that stay under it.
  basePath?: string;
}

const registrations = new Set<Registration>();

/**
 * The history the app is currently mounted on. The router shim's `listen`, and
 * the SDK data-app router, subscribe to location changes through this, since the
 * redux navigator is built before the router exists and cannot capture it.
 */
let currentHistory: History | null = null;

export function getCurrentHistory(): History | null {
  return currentHistory;
}

let dataAppHistory: History | null = null;

/**
 * A browser history for imperative navigation outside the app's router tree,
 * replacing v3's global `browserHistory` singleton. The SDK data-app bundle
 * mounts no router, so `getCurrentHistory()` is null there and it needs a history
 * of its own to drive the iframe's URL. Prefer the app's mounted history when one
 * exists, so the two never both attach to `window.history`; otherwise lazily
 * create a dedicated browser history (lazy so it is never created in the main app,
 * where it would fight the mounted router over `popstate`).
 */
export function getDataAppHistory(): History {
  if (currentHistory) {
    return currentHistory;
  }
  dataAppHistory ??= createBrowserHistory({ v5Compat: true });
  return dataAppHistory;
}

/**
 * Register a leave hook. The v7 `setRouteLeaveHook` shim calls this, so the
 * leave-confirm modals block navigation on v7 the same way they do on v3.
 * `basePath` scopes the hook to a route: it fires only when the destination
 * leaves that route's subtree, matching v3's `listenBeforeLeavingRoute`. Returns
 * the unregister function the caller uses as effect cleanup.
 */
export function registerLeaveHook(
  hook: LeaveHook,
  basePath?: string,
): () => void {
  const registration: Registration = { hook, basePath };
  registrations.add(registration);
  return () => {
    registrations.delete(registration);
  };
}

/**
 * Whether any leave hook is currently registered. The `beforeunload` guard lives
 * at the call sites (`useBeforeUnload`), so this is exposed only for assertions.
 */
export function hasLeaveHooks(): boolean {
  return registrations.size > 0;
}

function staysWithin(basePath: string | undefined, pathname: string): boolean {
  if (!basePath) {
    return false;
  }
  const base = basePath.replace(/\/$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isBlocked(nextLocation: HistoryLocation): boolean {
  // Snapshot so a hook that unregisters mid-run cannot skip a sibling.
  return [...registrations].some(({ hook, basePath }) => {
    // Navigating within the guarded route is not leaving it, so the hook does
    // not fire, exactly as v3's route-scoped leave hook behaves.
    if (staysWithin(basePath, nextLocation.pathname)) {
      return false;
    }
    return hook(nextLocation) === false;
  });
}

function toBlockedLocation(
  to: To,
  action: HistoryLocation["action"],
  state: unknown,
): HistoryLocation {
  const path = typeof to === "string" ? parsePath(to) : to;
  const location: V7Location = {
    pathname: path.pathname ?? "/",
    search: path.search ?? "",
    hash: path.hash ?? "",
    state: state ?? null,
    key: "default",
  };
  return toV3Location(location, action);
}

function isSameUrl(
  to: To,
  current: { pathname: string; search: string; hash: string },
): boolean {
  const path = typeof to === "string" ? parsePath(to) : to;
  return (
    (path.pathname ?? current.pathname) === current.pathname &&
    (path.search ?? "") === current.search &&
    (path.hash ?? "") === current.hash
  );
}

/**
 * Wrap a history so a registered leave hook can cancel navigation, restoring the
 * v3 `setRouteLeaveHook` behavior on the declarative v7 engine. react-router
 * funnels `Link`, `Navigate`, `useNavigate`, and redux `push` through the
 * history's `push`/`replace`, so checking there covers every in-app navigation.
 * Browser back/forward arrives as a `POP` in the listener and is reverted a step
 * when blocked.
 *
 * Written against the `History` interface, so it wraps a browser or a memory
 * history the same way. Replaced by native `useBlocker` once the app moves to the
 * data router (DEV-2375).
 */
export function withBlocking(history: History): History {
  let revertingPop = false;

  const push: History["push"] = (to, state) => {
    if (!isBlocked(toBlockedLocation(to, "PUSH", state))) {
      history.push(to, state);
    }
  };

  const replace: History["replace"] = (to, state) => {
    // v3/history@3 did not notify listeners when replacing to the current URL, so
    // effects that sync state into the URL by replacing the location they just
    // read stayed stable. v7's `v5Compat` history notifies on every replace,
    // which loops those effects (e.g. the dashboard's `useLocationSync`). Skip the
    // redundant replace to keep the v3 behavior.
    if (isSameUrl(to, history.location)) {
      return;
    }
    if (!isBlocked(toBlockedLocation(to, "REPLACE", state))) {
      history.replace(to, state);
    }
  };

  const listen: History["listen"] = (listener) => {
    return history.listen((update) => {
      // The forward step we issue below re-enters as its own POP; skip it.
      if (revertingPop) {
        revertingPop = false;
        return;
      }
      const isBlockedPop =
        update.action === "POP" &&
        isBlocked(toV3Location(update.location, "POP"));
      if (isBlockedPop) {
        // The browser already moved, so step forward to undo the back. One step
        // covers the back button, the dominant leave case; a multi-step go is
        // not reliably reversible without an index history does not expose.
        revertingPop = true;
        history.go(1);
        return;
      }
      listener(update);
    });
  };

  const overrides = { push, replace, listen };

  const blocking = new Proxy(history, {
    get(target, prop) {
      if (prop === "push" || prop === "replace" || prop === "listen") {
        return overrides[prop];
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  currentHistory = blocking;
  return blocking;
}
