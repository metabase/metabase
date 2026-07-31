import type { DataRouter } from "react-router";

import type { Action, Location as HistoryLocation } from "../types";

import { toFacadeLocation } from "./location";

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

// The router supports one blocker, so every leave hook shares this key.
const LEAVE_HOOK_BLOCKER_KEY = "route-leave-hooks";

/**
 * Point the data router's blocker at the leave-hook registry, so a hook
 * returning `false` cancels the navigation. The router consults the blocker
 * before it starts navigating, so `Link`, `Navigate`, `useNavigate`, and redux
 * `push` are all covered, and it reverses the history delta itself when a back
 * or forward is blocked.
 *
 * Replaced by native `useBlocker` once the leave-confirm call sites move to it
 * (DEV-2375).
 */
export function installLeaveHookBlocker(router: DataRouter): void {
  router.getBlocker(LEAVE_HOOK_BLOCKER_KEY, ({ nextLocation, historyAction }) =>
    isBlocked(toFacadeLocation(nextLocation), historyAction),
  );
}
