import type { Location as HistoryLocation } from "history";
import {
  type HistoryRouterProps,
  type To,
  type Location as V7Location,
  parsePath,
} from "react-router-v7";

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

const leaveHooks = new Set<LeaveHook>();

/**
 * Register a leave hook. The v7 `setRouteLeaveHook` shim calls this, so the
 * leave-confirm modals block navigation on v7 the same way they do on v3.
 * Returns the unregister function the caller uses as effect cleanup.
 */
export function registerLeaveHook(hook: LeaveHook): () => void {
  leaveHooks.add(hook);
  return () => {
    leaveHooks.delete(hook);
  };
}

/**
 * Whether any leave hook is currently registered. The `beforeunload` guard lives
 * at the call sites (`useBeforeUnload`), so this is exposed only for assertions.
 */
export function hasLeaveHooks(): boolean {
  return leaveHooks.size > 0;
}

function isBlocked(nextLocation: HistoryLocation): boolean {
  // Snapshot so a hook that unregisters mid-run cannot skip a sibling.
  return [...leaveHooks].some((hook) => hook(nextLocation) === false);
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
