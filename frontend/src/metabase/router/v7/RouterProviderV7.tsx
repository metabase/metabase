import type { PropsWithChildren } from "react";
import { BrowserRouter, MemoryRouter, Routes } from "react-router-v7";

import { getBasename } from "metabase/utils/basename";

import { V7ReduxBridge } from "./V7ReduxBridge";
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
 * `use-v7-router` flag.
 */
export function RouterProviderV7({ children }: PropsWithChildren): JSX.Element {
  return (
    <BrowserRouter basename={getBasename() || undefined}>
      <V7RouterTree>{children}</V7RouterTree>
    </BrowserRouter>
  );
}

/**
 * The v7 engine hosted on an in-memory history, for tests. Mirrors what
 * `renderWithProviders({ routerEngine: "v7" })` mounts.
 */
export function RouterProviderV7Memory({
  children,
  initialRoute,
}: PropsWithChildren<{ initialRoute: string }>): JSX.Element {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <V7RouterTree>{children}</V7RouterTree>
    </MemoryRouter>
  );
}
