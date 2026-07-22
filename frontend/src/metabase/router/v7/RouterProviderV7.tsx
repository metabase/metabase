import type { PropsWithChildren } from "react";
import { useState } from "react";
import {
  Routes,
  UNSAFE_createBrowserHistory as createBrowserHistory,
  UNSAFE_createMemoryHistory as createMemoryHistory,
} from "react-router-v7";

import { getBasename } from "metabase/utils/basename";

import { SyncHistoryRouter } from "./SyncHistoryRouter";
import { V7ReduxBridge } from "./V7ReduxBridge";
import { withBlocking } from "./blocking-history";
import { mapToV7 } from "./map-to-v7";

/**
 * The v7 route tree: the facade tree mapped to real v7 routes and rendered by
 * `<Routes>`, plus the redux bridge that mirrors location into `state.routing`
 * and lets `dispatch(push(...))` drive the router. Kept separate from the history
 * provider below so tests can host the same tree under a `<MemoryRouter>`.
 */
export function V7RouterTree({ children }: PropsWithChildren): JSX.Element {
  return (
    <>
      <V7ReduxBridge />
      <Routes>{mapToV7(children)}</Routes>
    </>
  );
}

/**
 * react-router v7 hosting the app, declarative mode (Phase 3.1). Replaces the v3
 * `<Router>` + `useRouterHistory` + `syncHistoryWithStore` stack behind the
 * `use-v7-router` flag. Hosted on a blocking history so `setRouteLeaveHook`
 * cancels navigation the way it does on v3.
 */
export function RouterProviderV7({ children }: PropsWithChildren): JSX.Element {
  // `v5Compat` makes the history notify its listeners on push/replace, which is
  // what `unstable_HistoryRouter` and the blocking wrapper both rely on.
  const [history] = useState(() =>
    withBlocking(createBrowserHistory({ v5Compat: true })),
  );
  return (
    <SyncHistoryRouter history={history} basename={getBasename() || undefined}>
      <V7RouterTree>{children}</V7RouterTree>
    </SyncHistoryRouter>
  );
}

/**
 * The v7 engine hosted on an in-memory history, for tests. Mirrors what
 * `renderWithProviders({ routerEngine: "v7" })` mounts, including navigation
 * blocking.
 */
export function RouterProviderV7Memory({
  children,
  initialRoute,
}: PropsWithChildren<{ initialRoute: string }>): JSX.Element {
  const [history] = useState(() =>
    withBlocking(
      createMemoryHistory({ initialEntries: [initialRoute], v5Compat: true }),
    ),
  );
  return (
    <SyncHistoryRouter history={history}>
      <V7RouterTree>{children}</V7RouterTree>
    </SyncHistoryRouter>
  );
}
