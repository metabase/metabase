import type { PropsWithChildren } from "react";
import { useCallback, useState } from "react";
import {
  type HistoryRouterProps,
  Routes,
  UNSAFE_createBrowserHistory as createBrowserHistory,
  UNSAFE_createMemoryHistory as createMemoryHistory,
} from "react-router";

import { useDispatch } from "metabase/redux";
import { getBasename } from "metabase/utils/basename";

import { LOCATION_CHANGE } from "../routing-reducer";

import { SyncHistoryRouter } from "./SyncHistoryRouter";
import { V7ReduxBridge } from "./V7ReduxBridge";
import { withBlocking } from "./blocking-history";
import { toV3Location } from "./location";
import { mapToV7 } from "./map-to-v7";
import { notifyLocationListeners } from "./navigator";

/**
 * The v7 route tree: the facade tree mapped to real v7 routes and rendered by
 * `<Routes>`, plus the redux bridge that mirrors location into `state.routing`
 * and lets `dispatch(push(...))` drive the router. Kept separate from the history
 * provider below so tests can host the same tree under a `<MemoryRouter>`.
 */
export function V7RouterTree({
  children,
  history,
}: PropsWithChildren<{
  history?: HistoryRouterProps["history"];
}>): JSX.Element {
  return (
    <>
      <V7ReduxBridge history={history} />
      <Routes>{mapToV7(children)}</Routes>
    </>
  );
}

/**
 * Mirrors each location into `state.routing` (and the `router.listen`
 * subscribers) from inside the history subscription, so the store is current
 * before any thunk reads it. Replaces v3's `syncHistoryWithStore`.
 */
function useLocationMirror() {
  const dispatch = useDispatch();
  return useCallback(
    (
      location: Parameters<typeof toV3Location>[0],
      action: Parameters<typeof toV3Location>[1],
    ) => {
      const v3Location = toV3Location(location, action);
      dispatch({ type: LOCATION_CHANGE, payload: v3Location });
      notifyLocationListeners(v3Location);
    },
    [dispatch],
  );
}

/**
 * react-router v7 hosting the app, declarative mode. Replaces the v3 `<Router>` +
 * `useRouterHistory` + `syncHistoryWithStore` stack. Hosted on a blocking history
 * so `setRouteLeaveHook` cancels navigation the way it did on v3.
 */
export function RouterProviderV7({ children }: PropsWithChildren): JSX.Element {
  // `v5Compat` makes the history notify its listeners on push/replace, which is
  // what `unstable_HistoryRouter` and the blocking wrapper both rely on.
  const [history] = useState(() =>
    withBlocking(createBrowserHistory({ v5Compat: true })),
  );
  const onLocationChange = useLocationMirror();
  return (
    <SyncHistoryRouter
      history={history}
      basename={getBasename() || undefined}
      onLocationChange={onLocationChange}
    >
      <V7RouterTree history={history}>{children}</V7RouterTree>
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
}: PropsWithChildren<{
  initialRoute: string;
  basename?: string;
  history?: MemoryTestHistory;
}>): JSX.Element {
  const [history] = useState(
    () => providedHistory ?? createMemoryTestHistory(initialRoute),
  );
  const onLocationChange = useLocationMirror();
  return (
    <SyncHistoryRouter
      history={history}
      basename={basename}
      onLocationChange={onLocationChange}
    >
      <V7RouterTree history={history}>{children}</V7RouterTree>
    </SyncHistoryRouter>
  );
}
