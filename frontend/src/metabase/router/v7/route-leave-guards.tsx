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
import type { Blocker, BlockerFunction, NavigateFunction } from "react-router";
import { NavigationType, useBlocker, useNavigate } from "react-router";
import { match } from "ts-pattern";

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

/**
 * Reissue the navigation the user agreed to, the way the leave-confirm call
 * sites used to once their hook had cancelled it. A POP cannot be replayed by
 * destination, so it goes back a step, which is the guess they made too.
 */
function reissue(navigate: NavigateFunction, args: BlockerArgs): void {
  match(args.historyAction)
    .with(NavigationType.Pop, () => navigate(-1))
    .with(NavigationType.Replace, () =>
      navigate(args.nextLocation, { replace: true }),
    )
    .with(NavigationType.Push, () => navigate(args.nextLocation))
    .exhaustive();
}

/** The navigation a guard is currently prompting about. */
interface HeldNavigation {
  guardId: string;
  args: BlockerArgs;
}

interface RouteLeaveGuardsValue {
  registerGuard: (id: string, guard: Guard) => () => void;
  held: HeldNavigation | null;
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
  const navigate = useNavigate();
  const guardsRef = useRef(new Map<string, Guard>());
  // Guards that already had their say about the navigation being held.
  const answeredRef = useRef(new Set<string>());
  const skipNextRef = useRef(false);
  // The navigation the user is being asked about, kept for as long as a prompt
  // is up. `blocker.location` is not a substitute: react-router holds one pending
  // navigation, so anything navigating meanwhile overwrites it.
  //
  // The ref is the one source of truth, because the blocker callback writes it
  // from outside React. Syncing it back from the state during a render would
  // reset it to whatever that render saw, and this provider wraps the whole app,
  // so renders land constantly. `held` mirrors it, purely to re-render guards.
  const heldRef = useRef<HeldNavigation | null>(null);
  const [held, setHeld] = useState<HeldNavigation | null>(null);

  const hold = useCallback((next: HeldNavigation | null) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

  const release = useCallback(() => {
    answeredRef.current.clear();
    hold(null);
  }, [hold]);

  const registerGuard = useCallback(
    (id: string, guard: Guard) => {
      guardsRef.current.set(id, guard);
      return () => {
        guardsRef.current.delete(id);
        answeredRef.current.delete(id);
        // The guard holding the navigation has gone, so nothing can answer for
        // it any more. Drop the navigation rather than leave it stuck.
        if (heldRef.current?.guardId === id) {
          release();
          blockerRef.current.reset?.();
        }
      };
    },
    [release],
  );

  const shouldBlock = useCallback<BlockerFunction>(
    (args) => {
      // The navigation we just reissued on the user's behalf. They already said
      // yes to it, so it goes through.
      if (skipNextRef.current) {
        skipNextRef.current = false;
        return false;
      }

      // A prompt is already up. Keep blocking, and keep asking about the
      // destination the user was originally shown.
      if (heldRef.current) {
        return true;
      }

      answeredRef.current.clear();
      const guardId = findBlockingGuard(
        guardsRef.current,
        args,
        answeredRef.current,
      );
      if (guardId == null) {
        return false;
      }

      hold({ guardId, args });
      return true;
    },
    [hold],
  );

  const blocker = useBlocker(shouldBlock);

  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const proceedFrom = useCallback(
    (id: string) => {
      const args = heldRef.current?.args;
      if (!args) {
        return;
      }
      answeredRef.current.add(id);

      const next = findBlockingGuard(
        guardsRef.current,
        args,
        answeredRef.current,
      );

      // Hand the prompt to the next guard that objects. Only once none is left
      // does the navigation itself resume.
      if (next) {
        hold({ guardId: next, args });
        return;
      }

      const prompted = args.nextLocation;
      const parked = blocker.location;
      release();

      if (prompted && parked && parked.key !== prompted.key) {
        // Something navigated while the prompt was up, and react-router holds
        // that navigation now. Resuming would send the user somewhere they were
        // never asked about, so reissue the one they agreed to instead.
        skipNextRef.current = true;
        blocker.reset?.();
        reissue(navigate, args);
      } else {
        blocker.proceed?.();
      }
    },
    [blocker, navigate, release, hold],
  );

  const resetAll = useCallback(() => {
    release();
    blocker.reset?.();
  }, [blocker, release]);

  const value = useMemo(
    () => ({ registerGuard, held, proceedFrom, resetAll }),
    [registerGuard, held, proceedFrom, resetAll],
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
    if (context?.held?.guardId !== id) {
      return IDLE_BLOCKER;
    }

    const { held, proceedFrom, resetAll } = context;
    return {
      state: "blocked",
      // The destination this guard was asked about, which is not always the one
      // react-router is holding by now.
      location: held.args.nextLocation,
      proceed: () => proceedFrom(id),
      reset: resetAll,
    };
  }, [context, id]);
}
