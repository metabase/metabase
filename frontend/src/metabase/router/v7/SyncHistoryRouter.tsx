import type { PropsWithChildren } from "react";
import { useLayoutEffect, useState } from "react";
import {
  type HistoryRouterProps,
  type NavigationType,
  Router,
  type Location as V7Location,
} from "react-router-v7";

type History = HistoryRouterProps["history"];

/**
 * `unstable_HistoryRouter` without the `startTransition`.
 *
 * react-router marks its own location update as a transition, so in a production
 * React build the navigation is deprioritised and can commit long after the click
 * that caused it. v3 navigated synchronously, and the app was written against
 * that: a navigation that lands mid-interaction remounts whatever is on screen,
 * which silently discarded state such as the text typed into a modal that was
 * opened right after clicking a link.
 *
 * Rendering `<Router>` ourselves off a plain state update keeps the v3 ordering.
 * The transition would only buy concurrent rendering that the app does not rely
 * on. Goes away with the v3 engine in Phase 4, once the app tolerates deferred
 * navigation.
 */
export function SyncHistoryRouter({
  history,
  basename,
  children,
}: PropsWithChildren<{
  history: History;
  basename?: string;
}>): JSX.Element {
  const [state, setState] = useState<{
    action: NavigationType;
    location: V7Location;
  }>({
    action: history.action,
    location: history.location,
  });

  // Layout, not passive, so the router state is committed before the browser
  // paints the click that triggered it.
  useLayoutEffect(() => history.listen(setState), [history]);

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
