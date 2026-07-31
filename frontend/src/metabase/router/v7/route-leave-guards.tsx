import type { PropsWithChildren, RefObject } from "react";
import { createContext, useContext, useMemo } from "react";
import type { Blocker, BlockerFunction } from "react-router";
import { useBlocker } from "react-router";

interface Guard {
  // Held as a ref because the caller's decision closes over state that changes
  // every render, while the registration itself must stay put.
  shouldBlock: RefObject<BlockerFunction>;
  // The matched pathname of the guarded route. A guard only fires when a
  // navigation leaves that route's subtree, so a guard with a base path does not
  // fire for destinations that stay under it.
  basePath?: string;
}

// Insertion order is mount order, so the innermost guard is asked first.
const guards = new Map<string, Guard>();

let blockedGuardId: string | null = null;

export function registerGuard(id: string, guard: Guard): () => void {
  guards.set(id, guard);
  return () => {
    guards.delete(id);
    if (blockedGuardId === id) {
      blockedGuardId = null;
    }
  };
}

function staysWithin(basePath: string | undefined, pathname: string): boolean {
  if (!basePath) {
    return false;
  }
  const base = basePath.replace(/\/$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * react-router holds one blocker per router, so the app registers exactly one
 * and fans it out here. Otherwise a second guard mounting anywhere on the page
 * would silently take over from the first: the caching sidebar's form guard sits
 * inside both the dashboard and the query builder, which carry their own.
 *
 * The one-blocker limit, and what upstream intends to do about it, is tracked in
 * https://github.com/remix-run/react-router/discussions/9978. Drop this fan-out
 * if react-router grows support for several blockers.
 */
const shouldBlockAnyGuard: BlockerFunction = (args) => {
  const blocking = [...guards.entries()].find(
    ([, { shouldBlock, basePath }]) =>
      !staysWithin(basePath, args.nextLocation.pathname) &&
      shouldBlock.current?.(args),
  );

  blockedGuardId = blocking?.[0] ?? null;
  return blocking != null;
};

interface RouteLeaveBlockerValue {
  blocker: Blocker;
  blockedGuardId: string | null;
}

const RouteLeaveBlockerContext = createContext<RouteLeaveBlockerValue | null>(
  null,
);

/**
 * Owns the router's blocker, on behalf of every route-leave guard below it. The
 * guard that blocked gets the live blocker and so drives the prompt; the rest
 * see an idle one.
 *
 * Sits in `AppShell`, so a component rendered outside a router (which specs do)
 * finds no provider and its guard is inert rather than an error.
 */
export function RouteLeaveGuards({ children }: PropsWithChildren): JSX.Element {
  const blocker = useBlocker(shouldBlockAnyGuard);

  // `blockedGuardId` is set while the router asks the blocker, which is what
  // schedules this render, so it names the guard this blocker belongs to.
  const value = useMemo(() => ({ blocker, blockedGuardId }), [blocker]);

  return (
    <RouteLeaveBlockerContext.Provider value={value}>
      {children}
    </RouteLeaveBlockerContext.Provider>
  );
}

const IDLE_BLOCKER: Blocker = {
  state: "unblocked",
  proceed: undefined,
  reset: undefined,
  location: undefined,
};

/**
 * The shared blocker, but only for the guard that blocked the navigation.
 */
export function useBlockedGuard(id: string): Blocker {
  const shared = useContext(RouteLeaveBlockerContext);
  return shared?.blockedGuardId === id ? shared.blocker : IDLE_BLOCKER;
}
