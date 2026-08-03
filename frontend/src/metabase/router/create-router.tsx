import {
  type DataRouter,
  type RouteObject,
  createBrowserRouter,
  createMemoryRouter,
} from "react-router";

import { AppShell } from "./AppShell";
import { setRouterExpected } from "./navigator";

export type MemoryTestRouter = DataRouter;

/**
 * Lets the test harness hand out a `history` handle before the route tree, and
 * so the router, exists.
 */
export type MemoryTestRouterHolder = { current: MemoryTestRouter | null };

/**
 * The app's routes under a pathless layout route.
 *
 * The layout route contributes no path, so it changes no matching. It exists so
 * relative redux navigation resolves from the root (see `AppShell`) and as the
 * seat for anything the app shell needs above the route tree.
 */
function withAppShell(routes: RouteObject[]): RouteObject[] {
  // Every router this module builds gets an `AppShell`, and every `AppShell`
  // registers a `navigate`. That is what lets the navigator hold a navigation
  // made before the registration, knowing one is coming.
  setRouterExpected(true);
  return [{ element: <AppShell />, children: routes }];
}

export function createAppRouter(
  routes: RouteObject[],
  basename?: string,
): DataRouter {
  return createBrowserRouter(withAppShell(routes), { basename });
}

export function createMemoryAppRouter(
  routes: RouteObject[],
  initialRoute: string,
  basename?: string,
): DataRouter {
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  return createMemoryRouter(withAppShell(routes), {
    basename,
    initialEntries: [entry],
  });
}
