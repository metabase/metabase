import type { PropsWithChildren } from "react";
import { BrowserRouter, Routes } from "react-router-v7";

import { getBasename } from "metabase/utils/basename";

import { mapToV7 } from "./map-to-v7";

/**
 * The v7 route tree: the facade tree mapped to real v7 routes and rendered by
 * `<Routes>`. Kept separate from the history provider below so tests can host the
 * same tree under a `<MemoryRouter>`.
 */
export function V7RouterTree({ children }: PropsWithChildren): JSX.Element {
  return <Routes>{mapToV7(children)}</Routes>;
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
