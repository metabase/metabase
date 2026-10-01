import type { ReactNode } from "react";
import {
  type DataRouter,
  type RouteObject,
  createBrowserRouter,
  createMemoryRouter,
} from "react-router";

import { AppShell } from "./AppShell";
import { setRouter, setRouterExpected } from "./navigator";

export type MemoryTestRouter = DataRouter;

/**
 * Lets the test harness hand out its router handle before the route tree, and
 * so the router, exists.
 */
export type MemoryTestRouterHolder = { current: MemoryTestRouter | null };

/**
 * The app's routes under a pathless layout route.
 *
 * The layout route contributes no path, so it changes no matching. It exists so
 * relative redux navigation resolves from the root (see `AppShell`) and as the
 * seat for anything the app shell needs above the route tree.
 *
 * `hydrateFallback` is what the router shows before it initializes. That window
 * is empty unless the first URL matches a `lazy` route, in which case the whole
 * tree, chrome included, waits on the chunk. Without a fallback the page is
 * blank for that time. The router cannot build one itself, so the app passes it
 * in.
 */
function withAppShell(
  routes: RouteObject[],
  hydrateFallback?: ReactNode,
): RouteObject[] {
  // Every router this module builds gets an `AppShell`, and every `AppShell`
  // registers a `navigate`. That is what lets the navigator hold a navigation
  // made before the registration, knowing one is coming.
  setRouterExpected(true);
  return [
    {
      element: <AppShell />,
      hydrateFallbackElement: hydrateFallback,
      children: routes,
    },
  ];
}

/**
 * `getIsNavigationPending` reads the router's own navigation state, which
 * react-router publishes nowhere else outside a component.
 */
function register(router: DataRouter): DataRouter {
  setRouter(router);
  return router;
}

export function createAppRouter(
  routes: RouteObject[],
  basename?: string,
  hydrateFallback?: ReactNode,
): DataRouter {
  return register(
    createBrowserRouter(withAppShell(routes, hydrateFallback), { basename }),
  );
}

export function createMemoryAppRouter(
  routes: RouteObject[],
  initialRoute: string,
  basename?: string,
  hydrateFallback?: ReactNode,
): DataRouter {
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  return register(
    createMemoryRouter(withAppShell(routes, hydrateFallback), {
      basename,
      initialEntries: [entry],
    }),
  );
}
