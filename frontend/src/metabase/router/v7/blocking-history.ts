import {
  type HistoryRouterProps,
  type To,
  type Location as V7Location,
  parsePath,
} from "react-router";

import type { Action, Location as HistoryLocation } from "../types";

import { toFacadeLocation } from "./location";

// react-router does not export the `History` interface directly, so pull it off
// the history prop of `unstable_HistoryRouter`, which is exactly the type the
// router accepts and the blocking wrapper returns.
type History = HistoryRouterProps["history"];

/**
 * A route-leave hook: it receives the attempted destination and how it was
 * reached, and returns `false` to cancel the navigation. The navigation type is
 * a second argument rather than a field on the location, which carries only the
 * URL parts on v7.
 */
type LeaveHook = (
  nextLocation?: HistoryLocation,
  navigationType?: Action,
) => unknown;

interface Registration {
  hook: LeaveHook;
  // The matched pathname of the guarded route. A leave hook is scoped to a route
  // and only fires when a navigation leaves that route's subtree, so a hook with
  // a base path does not fire for destinations that stay under it.
  basePath?: string;
}

const registrations = new Set<Registration>();

/**
 * Register a leave hook, so the leave-confirm modals block navigation the way
 * they did on v3. `useRouteLeaveHook` is the call site; `basePath` scopes the
 * hook to a route, so it fires only when the destination leaves that route's
 * subtree, matching v3's `listenBeforeLeavingRoute`. Returns the unregister
 * function the caller uses as effect cleanup.
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

function isBlocked(
  nextLocation: HistoryLocation,
  navigationType: Action,
): boolean {
  // Snapshot so a hook that unregisters mid-run cannot skip a sibling.
  return [...registrations].some(({ hook, basePath }) => {
    // Navigating within the guarded route is not leaving it, so the hook does
    // not fire, exactly as v3's route-scoped leave hook behaves.
    if (staysWithin(basePath, nextLocation.pathname)) {
      return false;
    }
    return hook(nextLocation, navigationType) === false;
  });
}

function toBlockedLocation(to: To, state: unknown): HistoryLocation {
  const path = typeof to === "string" ? parsePath(to) : to;
  const location: V7Location = {
    pathname: path.pathname ?? "/",
    search: path.search ?? "",
    hash: path.hash ?? "",
    state: state ?? null,
    key: "default",
  };
  return toFacadeLocation(location);
}

/**
 * Wrap a history so a registered leave hook can cancel navigation, restoring the
 * v3 route-leave behavior on the declarative v7 engine. react-router
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
    if (!isBlocked(toBlockedLocation(to, state), "PUSH")) {
      history.push(to, state);
    }
  };

  const replace: History["replace"] = (to, state) => {
    if (!isBlocked(toBlockedLocation(to, state), "REPLACE")) {
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
        isBlocked(toFacadeLocation(update.location), "POP");
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

  return new Proxy(history, {
    get(target, prop) {
      if (prop === "push" || prop === "replace" || prop === "listen") {
        return overrides[prop];
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
