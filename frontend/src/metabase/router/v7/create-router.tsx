import type { ReactNode } from "react";
import {
  type DataRouter,
  Route,
  createBrowserRouter,
  createMemoryRouter,
  createRoutesFromElements,
} from "react-router";

import { AppShell } from "./AppShell";
import { installLeaveHookBlocker } from "./leave-hooks";
import { mapToV7 } from "./map-to-v7";

export type MemoryTestRouter = DataRouter;

/**
 * Lets the test harness hand out a `history` handle before the route tree, and
 * so the router, exists.
 */
export type MemoryTestRouterHolder = { current: MemoryTestRouter | null };

/**
 * The whole facade tree as real data routes, under a pathless layout route.
 *
 * The layout route contributes no path, so it changes no matching. It exists so
 * relative redux navigation resolves from the root (see `AppShell`) and as the
 * seat for anything the app shell needs above the route tree.
 */
function toDataRoutes(tree: ReactNode) {
  return createRoutesFromElements(
    <Route element={<AppShell />}>{mapToV7(tree)}</Route>,
  );
}

export function createAppRouter(
  tree: ReactNode,
  basename?: string,
): DataRouter {
  const router = createBrowserRouter(toDataRoutes(tree), { basename });
  installLeaveHookBlocker(router);
  return router;
}

export function createMemoryAppRouter(
  tree: ReactNode,
  initialRoute: string,
  basename?: string,
): DataRouter {
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  const router = createMemoryRouter(toDataRoutes(tree), {
    basename,
    initialEntries: [entry],
  });
  installLeaveHookBlocker(router);
  return router;
}
