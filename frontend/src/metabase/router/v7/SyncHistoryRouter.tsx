import type { PropsWithChildren } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  type HistoryRouterProps,
  type NavigationType,
  Router,
  type Location as V7Location,
} from "react-router-v7";

type History = HistoryRouterProps["history"];

/**
 * `unstable_HistoryRouter` without the `startTransition`, plus a hook for
 * mirroring the location elsewhere.
 *
 * react-router marks its own location update as a transition, so in a production
 * React build the navigation is deprioritised and can commit long after the click
 * that caused it. v3 navigated synchronously, and the app was written against
 * that: a navigation that lands mid-interaction remounts whatever is on screen,
 * which silently discarded state such as the text typed into a modal that was
 * opened right after clicking a link.
 *
 * `onLocationChange` runs inside the same history subscription, so `state.routing`
 * is updated as part of the transition the way v3's `syncHistoryWithStore` did.
 * Thunks read the store synchronously right after navigating, so a store that
 * lags a render makes them push a stale location. This stays the blocking
 * history's only subscriber: its POP-revert bookkeeping is per-history rather
 * than per-listener, so a second subscription would double-evaluate the leave
 * hooks.
 *
 * Goes away with the v3 engine in Phase 4, once the app tolerates deferred
 * navigation.
 */
export function SyncHistoryRouter({
  history,
  basename,
  onLocationChange,
  children,
}: PropsWithChildren<{
  history: History;
  basename?: string;
  onLocationChange?: (location: V7Location, action: NavigationType) => void;
}>): JSX.Element {
  const [state, setState] = useState<{
    action: NavigationType;
    location: V7Location;
  }>({
    action: history.action,
    location: history.location,
  });

  // Read through a ref so a new callback identity does not resubscribe the
  // history, which would drop and re-add its only listener.
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  // Layout, not passive, so the router state is committed before the browser
  // paints the click that triggered it.
  useLayoutEffect(() => {
    onLocationChangeRef.current?.(history.location, history.action);
    return history.listen((update) => {
      setState(update);
      onLocationChangeRef.current?.(update.location, update.action);
    });
  }, [history]);

  return (
    <Router
      basename={basename}
      location={state.location}
      navigationType={state.action}
      navigator={history}
    >
      {children}
    </Router>
  );
}
