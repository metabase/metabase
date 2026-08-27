import type { PropsWithChildren, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Blocker, BlockerFunction } from "react-router";
import { useBlocker } from "react-router";

type BlockerArgs = Parameters<BlockerFunction>[0];

interface Guard {
  // Held as a ref because the caller's decision closes over state that changes
  // every render, while the registration itself must stay put.
  shouldBlock: RefObject<BlockerFunction>;
  // The matched pathname of the guarded route. A guard only fires when a
  // navigation leaves that route's subtree, so a guard with a base path does not
  // fire for destinations that stay under it.
  basePath?: string;
}

function staysWithin(basePath: string | undefined, pathname: string): boolean {
  if (!basePath) {
    return false;
  }
  const base = basePath.replace(/\/$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The first guard that wants to stop this navigation and has not been answered
 * for it yet. Insertion order is mount order, so the innermost guard goes first.
 */
function findBlockingGuard(
  guards: Map<string, Guard>,
  args: BlockerArgs,
  answered: Set<string>,
): string | null {
  for (const [id, { shouldBlock, basePath }] of guards) {
    if (answered.has(id) || staysWithin(basePath, args.nextLocation.pathname)) {
      continue;
    }
    if (shouldBlock.current?.(args)) {
      return id;
    }
  }
  return null;
}

interface RouteLeaveGuardsValue {
  registerGuard: (id: string, guard: Guard) => () => void;
  blockedGuardId: string | null;
  blocker: Blocker;
  proceedFrom: (id: string) => void;
  resetAll: () => void;
}

const RouteLeaveGuardsContext = createContext<RouteLeaveGuardsValue | null>(
  null,
);

/**
 * Owns the router's blocker on behalf of every route-leave guard below it.
 *
 * react-router holds one blocker per router, and a second `useBlocker` silently
 * takes over from the first, so the app registers exactly one and fans it out.
 * That matters here: the caching sidebar's form guard sits inside both the
 * dashboard and the query builder, which carry their own. The one-blocker limit
 * is tracked in https://github.com/remix-run/react-router/discussions/9978. Drop
 * this fan-out if react-router grows support for several blockers.
 *
 * Guards are answered in turn. The first one that blocks gets the prompt, and
 * letting it through asks the rest before the navigation resumes, so two dirty
 * forms on one page prompt twice, as they did when each guard cancelled the
 * navigation outright.
 *
 * The registry lives here rather than at module level, so a guard rendered
 * outside a router registers nowhere and stays inert. A module-level registry
 * would still be consulted by a router mounted elsewhere, and could then block a
 * navigation that no mounted component is able to release.
 */
export function RouteLeaveGuards({ children }: PropsWithChildren): JSX.Element {
  const guardsRef = useRef(new Map<string, Guard>());
  // Guards that already had their say about the navigation being held.
  const answeredRef = useRef(new Set<string>());
  const blockedArgsRef = useRef<BlockerArgs | null>(null);
  const [blockedGuardId, setBlockedGuardId] = useState<string | null>(null);

  const registerGuard = useCallback((id: string, guard: Guard) => {
    guardsRef.current.set(id, guard);
    return () => {
      guardsRef.current.delete(id);
      answeredRef.current.delete(id);
      setBlockedGuardId((current) => (current === id ? null : current));
    };
  }, []);

  const shouldBlock = useCallback<BlockerFunction>((args) => {
    answeredRef.current.clear();
    blockedArgsRef.current = args;

    const id = findBlockingGuard(guardsRef.current, args, answeredRef.current);
    setBlockedGuardId(id);
    return id != null;
  }, []);

  const blocker = useBlocker(shouldBlock);

  const proceedFrom = useCallback(
    (id: string) => {
      answeredRef.current.add(id);

      const args = blockedArgsRef.current;
      const next = args
        ? findBlockingGuard(guardsRef.current, args, answeredRef.current)
        : null;

      // Hand the prompt to the next guard that objects. Only once none is left
      // does the navigation itself resume.
      if (next) {
        setBlockedGuardId(next);
      } else {
        blocker.proceed?.();
      }
    },
    [blocker],
  );

  const resetAll = useCallback(() => {
    answeredRef.current.clear();
    setBlockedGuardId(null);
    blocker.reset?.();
  }, [blocker]);

  const value = useMemo(
    () => ({ registerGuard, blockedGuardId, blocker, proceedFrom, resetAll }),
    [registerGuard, blockedGuardId, blocker, proceedFrom, resetAll],
  );

  return (
    <RouteLeaveGuardsContext.Provider value={value}>
      {children}
    </RouteLeaveGuardsContext.Provider>
  );
}

const IDLE_BLOCKER: Blocker = {
  state: "unblocked",
  proceed: undefined,
  reset: undefined,
  location: undefined,
};

/**
 * Whether a leave prompt is holding a navigation right now.
 *
 * A page that syncs its own URL has to stand still while one is up. react-router
 * keeps a single pending navigation, so navigating now replaces the one the user
 * is being asked about, and letting them through would then take them somewhere
 * they never agreed to.
 */
export function useIsNavigationHeld(): boolean {
  const context = useContext(RouteLeaveGuardsContext);
  return context?.blockedGuardId != null && context.blocker.state === "blocked";
}

/**
 * Registers a guard with the nearest `RouteLeaveGuards`, and reports the blocker
 * for as long as that guard is the one holding the navigation. Outside a router
 * there is no provider, so the guard registers nowhere and stays idle.
 */
export function useGuardedBlocker(
  id: string,
  shouldBlock: RefObject<BlockerFunction>,
  basePath: string | undefined,
): Blocker {
  const context = useContext(RouteLeaveGuardsContext);
  const registerGuard = context?.registerGuard;

  useEffect(
    () => registerGuard?.(id, { shouldBlock, basePath }),
    [registerGuard, id, shouldBlock, basePath],
  );

  return useMemo<Blocker>(() => {
    if (!context) {
      return IDLE_BLOCKER;
    }

    const { blocker, blockedGuardId, proceedFrom, resetAll } = context;
    if (blockedGuardId !== id || blocker.state !== "blocked") {
      return IDLE_BLOCKER;
    }

    return {
      state: "blocked",
      location: blocker.location,
      proceed: () => proceedFrom(id),
      reset: resetAll,
    };
  }, [context, id]);
}
