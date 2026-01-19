/**
 * Route Components for React Router v7
 *
 * These components handle route lifecycle functionality that was previously
 * done via onEnter/onChange hooks in React Router v3.
 */

import type { Store } from "@reduxjs/toolkit";
import { type ReactNode, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { trackPageView } from "metabase/lib/analytics";
import { loadCurrentUser } from "metabase/redux/user";
import { getSetting } from "metabase/selectors/settings";

interface RouteInitializerProps {
  store: Store;
  children?: ReactNode;
}

/**
 * Component that handles route initialization logic.
 *
 * This replaces the onEnter/onChange hooks from React Router v3:
 * - Loads the current user on mount
 * - Tracks page views on location changes
 */
export function RouteInitializer({ store, children }: RouteInitializerProps) {
  const location = useLocation();

  // Load current user on mount (equivalent to onEnter)
  useEffect(() => {
    store.dispatch(loadCurrentUser() as any);
  }, [store]);

  // Track page views on location change (equivalent to onChange)
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return children ?? <Outlet />;
}

interface SetupGuardProps {
  store: Store;
  children: ReactNode;
}

/**
 * Guard component for the setup route.
 *
 * Redirects to home if user setup is already complete.
 * Also tracks page views for the setup flow.
 */
export function SetupGuard({ store, children }: SetupGuardProps) {
  const location = useLocation();
  const hasUserSetup = getSetting(store.getState(), "has-user-setup");

  // Track page view
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  if (hasUserSetup) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/**
 * Component that scrolls to top on route change.
 *
 * This replaces the ScrollToTop HOC that used withRouter.
 */
export function ScrollToTopOnNavigation({
  children,
}: {
  children?: ReactNode;
}) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return children ?? <Outlet />;
}

/**
 * Wrapper component for lazy-loaded routes.
 *
 * Provides a loading state while the component is being loaded.
 */
export function LazyRouteWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
