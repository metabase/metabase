import type { ReactNode } from "react";
import {
  type DataRouter,
  type RouteObject,
  createBrowserRouter,
  createMemoryRouter,
} from "react-router";

import { AppShell } from "./AppShell";
import { withChunkFallback } from "./lazy-page";
import { type ChunkErrorFallback, withChunkErrorRecovery } from "./lazy-route";
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
 * `loadingFallback` is what stands in for a page whose chunk has not arrived.
 * The router shows it before it initializes, which is only ever a wait on a
 * chunk: the first URL matching a `lazy` route makes the whole tree, chrome
 * included, wait on it, and without a fallback the page is blank for that time.
 * `withChunkFallback` then shows the same thing in a single page's place once a
 * navigation has waited long enough. The router cannot build one itself, so the
 * app passes it in.
 */
function withAppShell(
  routes: RouteObject[],
  loadingFallback?: ReactNode,
  chunkErrorFallback?: ChunkErrorFallback,
): RouteObject[] {
  // Every router this module builds gets an `AppShell`, and every `AppShell`
  // registers a `navigate`. That is what lets the navigator hold a navigation
  // made before the registration, knowing one is coming.
  setRouterExpected(true);
  return [
    {
      element: <AppShell />,
      hydrateFallbackElement: loadingFallback,
      // Recovery sits closest to the loader, so a retry is a fresh request.
      // `withChunkFallback` holds the first one for the life of the page.
      children: withChunkFallback(
        withChunkErrorRecovery(routes, chunkErrorFallback),
        loadingFallback,
      ),
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
  loadingFallback?: ReactNode,
  chunkErrorFallback?: ChunkErrorFallback,
): DataRouter {
  return register(
    createBrowserRouter(
      withAppShell(routes, loadingFallback, chunkErrorFallback),
      { basename },
    ),
  );
}

export function createMemoryAppRouter(
  routes: RouteObject[],
  initialRoute: string,
  basename?: string,
  loadingFallback?: ReactNode,
  chunkErrorFallback?: ChunkErrorFallback,
): DataRouter {
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  return register(
    createMemoryRouter(
      withAppShell(routes, loadingFallback, chunkErrorFallback),
      {
        basename,
        initialEntries: [entry],
      },
    ),
  );
}
