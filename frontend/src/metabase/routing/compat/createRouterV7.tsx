import type { Store } from "@reduxjs/toolkit";
import {
  type RouteObject,
  RouterProvider as RouterProviderV7,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router-dom";

import { trackPageView } from "metabase/lib/analytics";

// Remove trailing slash from basename
const BASENAME = (window as any).MetabaseRoot?.replace(/\/+$/, "") || "";

/**
 * Create a React Router v7 browser router with the given routes.
 *
 * @param routes - Array of RouteObject for v7, or JSX elements to convert
 * @param store - Redux store (for data loading in loaders if needed)
 */
export function createAppRouterV7(
  routes: RouteObject[] | React.ReactElement,
  _store: Store,
) {
  const routeObjects = Array.isArray(routes)
    ? routes
    : createRoutesFromElements(routes);

  const router = createBrowserRouter(routeObjects, {
    basename: BASENAME,
    future: {
      // Enable any future flags here
    },
  });

  // Subscribe to navigation for analytics tracking
  router.subscribe((state) => {
    if (state.historyAction !== "POP") {
      trackPageView(state.location.pathname);
    }
  });

  return router;
}

interface AppRouterProviderProps {
  router: ReturnType<typeof createBrowserRouter>;
}

/**
 * React Router v7 Provider component.
 *
 * This wraps the new RouterProvider from react-router-dom v7.
 */
export function AppRouterProviderV7({ router }: AppRouterProviderProps) {
  return <RouterProviderV7 router={router} />;
}

/**
 * Navigation listener for Redux integration.
 *
 * This is a lightweight replacement for react-router-redux that
 * just listens to navigation events without syncing the full
 * location to Redux state.
 *
 * Use this if you need to dispatch Redux actions on navigation.
 */
export function createNavigationListener(
  router: ReturnType<typeof createBrowserRouter>,
  _store: Store,
) {
  return router.subscribe((_state) => {
    // You can dispatch Redux actions here if needed for specific use cases
    // For example, clearing error state on navigation:
    // _store.dispatch({ type: 'LOCATION_CHANGED', payload: _state.location });
  });
}
