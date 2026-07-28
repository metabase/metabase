import type { PropsWithChildren } from "react";
import { useState } from "react";
import {
  type HistoryRouterProps,
  Routes,
  UNSAFE_createBrowserHistory as createBrowserHistory,
  UNSAFE_createMemoryHistory as createMemoryHistory,
} from "react-router";

import { getBasename } from "metabase/utils/basename";

import { SyncHistoryRouter } from "./SyncHistoryRouter";
import { V7RouterBridge } from "./V7RouterBridge";
import { withBlocking } from "./blocking-history";
import type { LocationMirror } from "./location-mirror";
import { mapToV7 } from "./map-to-v7";

/**
 * The v7 route tree: the facade tree mapped to real v7 routes and rendered by
 * `<Routes>`, plus the bridge that publishes the live `navigate` and mirrors the
 * location out to `onLocationChange`. Kept separate from the history provider
 * below so tests can host the same tree under a `<MemoryRouter>`.
 */
export function V7RouterTree({
  children,
  history,
  onLocationChange,
}: PropsWithChildren<{
  history?: HistoryRouterProps["history"];
  onLocationChange?: LocationMirror;
}>): JSX.Element {
  return (
    <>
      <V7RouterBridge history={history} onLocationChange={onLocationChange} />
      <Routes>{mapToV7(children)}</Routes>
    </>
  );
}

/**
 * react-router v7 hosting the app, declarative mode. Replaces the v3 `<Router>` +
 * `useRouterHistory` + `syncHistoryWithStore` stack. Hosted on a blocking history
 * so `setRouteLeaveHook` cancels navigation the way it did on v3.
 *
 * `onLocationChange` is how the location reaches redux: the app passes
 * `createLocationMirror(store.dispatch)`, so the router itself stays unaware of
 * the store.
 */
export function RouterProviderV7({
  children,
  onLocationChange,
}: PropsWithChildren<{ onLocationChange?: LocationMirror }>): JSX.Element {
  // `v5Compat` makes the history notify its listeners on push/replace, which is
  // what `unstable_HistoryRouter` and the blocking wrapper both rely on.
  const [history] = useState(() =>
    withBlocking(createBrowserHistory({ v5Compat: true })),
  );
  return (
    <SyncHistoryRouter
      history={history}
      basename={getBasename() || undefined}
      onLocationChange={onLocationChange}
    >
      <V7RouterTree history={history} onLocationChange={onLocationChange}>
        {children}
      </V7RouterTree>
    </SyncHistoryRouter>
  );
}

/**
 * The in-memory blocking history the test engine runs on. Exposed so the test
 * harness can own the instance and hand tests a handle on it, rather than it
 * being created (and trapped) inside the provider.
 */
export function createMemoryTestHistory(initialRoute: string) {
  // history@3 resolved a relative initial entry against the root; v7 keeps it
  // relative, and a location without a leading slash then matches no route. Specs
  // written against v3 pass both forms, so normalize.
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  return withBlocking(
    createMemoryHistory({ initialEntries: [entry], v5Compat: true }),
  );
}

export type MemoryTestHistory = ReturnType<typeof createMemoryTestHistory>;

/**
 * The v7 engine hosted on an in-memory history, for tests. Mirrors what
 * `renderWithProviders({ routerEngine: "v7" })` mounts, including navigation
 * blocking. Pass `history` to drive and inspect it from outside the tree.
 */
export function RouterProviderV7Memory({
  children,
  initialRoute,
  basename,
  history: providedHistory,
  onLocationChange,
}: PropsWithChildren<{
  initialRoute: string;
  basename?: string;
  history?: MemoryTestHistory;
  onLocationChange?: LocationMirror;
}>): JSX.Element {
  const [history] = useState(
    () => providedHistory ?? createMemoryTestHistory(initialRoute),
  );
  return (
    <SyncHistoryRouter
      history={history}
      basename={basename}
      onLocationChange={onLocationChange}
    >
      <V7RouterTree history={history} onLocationChange={onLocationChange}>
        {children}
      </V7RouterTree>
    </SyncHistoryRouter>
  );
}
