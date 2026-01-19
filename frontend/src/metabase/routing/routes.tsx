/**
 * React Router v7 Route Configuration (WIP)
 *
 * This file shows the STRUCTURE of the route configuration in v7 format.
 * It serves as a reference for the migration but is not yet functional
 * because existing components expect props from v3 routing (location, params, etc.).
 *
 * Migration steps for each route:
 * 1. Update the component to use hooks instead of props:
 *    - useLocation() instead of props.location
 *    - useParams() instead of props.params
 *    - useNavigate() instead of props.router.push
 * 2. Add the route to this file
 * 3. Test the route works correctly
 *
 * During migration, this file will be gradually built up to match routes.jsx.
 * Once complete, routes.jsx will be deprecated and removed.
 */

import type { Store } from "@reduxjs/toolkit";
import { Navigate, type RouteObject } from "react-router-dom";

// These imports are commented out until the components are migrated
// import App from "metabase/App";
// import { Login } from "metabase/auth/components/Login";
// etc.

import {
  IsAuthenticatedGuard,
  IsNotAuthenticatedGuard,
  UserCanAccessOnboardingGuard,
} from "./compat";

/**
 * Route structure for React Router v7.
 *
 * This shows how the routes will be structured once components are migrated.
 * Each component needs to be updated to use hooks before it can be used here.
 *
 * Example of migrated component structure:
 *
 * ```tsx
 * // Before (v3 props):
 * function MyComponent({ location, params, router }) {
 *   const handleClick = () => router.push('/path');
 *   return <div>{params.id}</div>;
 * }
 *
 * // After (v7 hooks):
 * function MyComponent() {
 *   const location = useLocation();
 *   const params = useParams<{ id: string }>();
 *   const navigate = useNavigate();
 *   const handleClick = () => navigate('/path');
 *   return <div>{params.id}</div>;
 * }
 * ```
 */
export function createRoutes(_store: Store): RouteObject[] {
  // This is a placeholder structure showing how routes will be organized.
  // Components need to be migrated before they can be used here.

  return [
    {
      // Root layout component (App)
      // element: <App />,
      children: [
        // Setup route
        {
          path: "/setup",
          // element: <SetupGuard><Setup /></SetupGuard>,
        },

        // Auth routes
        {
          path: "/auth",
          children: [
            { index: true, element: <Navigate to="/auth/login" replace /> },
            {
              element: <IsNotAuthenticatedGuard />,
              children: [
                { path: "login" /* element: <Login /> */ },
                { path: "login/:provider" /* element: <Login /> */ },
              ],
            },
            { path: "logout" /* element: <Logout /> */ },
            { path: "forgot_password" /* element: <ForgotPassword /> */ },
            { path: "reset_password/:token" /* element: <ResetPassword /> */ },
          ],
        },

        // Main authenticated section
        {
          element: <IsAuthenticatedGuard />,
          children: [
            // Home
            { path: "/" /* element: <HomePage /> */ },

            // Onboarding
            {
              path: "/getting-started",
              element: <UserCanAccessOnboardingGuard />,
              children: [{ index: true /* element: <Onboarding /> */ }],
            },

            // Search
            { path: "/search" /* element: <SearchApp /> */ },

            // Collections with modal routes
            {
              path: "/collection/:slug",
              // element: <CollectionLanding />,
              children: [
                // createModalRoute("move", MoveCollectionModal, { noWrap: true }),
                // createModalRoute("archive", ArchiveCollectionModal, { noWrap: true }),
              ],
            },

            // Dashboards with modal routes
            {
              path: "/dashboard/:slug",
              // element: <DashboardApp />,
              children: [
                // createModalRoute("move", DashboardMoveModal, { noWrap: true }),
                // createModalRoute("copy", DashboardCopyModal, { noWrap: true }),
                // createModalRoute("archive", ArchiveDashboardModal, { noWrap: true }),
              ],
            },

            // Question/Query Builder
            {
              path: "/question",
              children: [
                { index: true /* element: <QueryBuilder /> */ },
                { path: "notebook" /* element: <QueryBuilder /> */ },
                { path: ":slug" /* element: <QueryBuilder /> */ },
                { path: ":slug/notebook" /* element: <QueryBuilder /> */ },
              ],
            },

            // Browse
            {
              path: "/browse",
              children: [
                {
                  index: true,
                  element: <Navigate to="/browse/models" replace />,
                },
                { path: "metrics" /* element: <BrowseMetrics /> */ },
                { path: "models" /* element: <BrowseModels /> */ },
                { path: "databases" /* element: <BrowseDatabases /> */ },
                { path: "databases/:slug" /* element: <BrowseSchemas /> */ },
                {
                  path: "databases/:dbId/schema/:schemaName",
                  /* element: <BrowseTables /> */
                },
              ],
            },

            // Admin routes (complex, will be migrated separately)
            {
              path: "/admin/*",
              // Will use lazy loading for admin routes
            },
          ],
        },

        // Catch-all for 404
        { path: "*" /* element: <NotFoundFallbackPage /> */ },
      ],
    },
  ];
}

/**
 * Route paths for type-safe navigation.
 *
 * Usage:
 * ```tsx
 * const navigate = useNavigate();
 * navigate(ROUTES.dashboard("my-dashboard-123"));
 * ```
 */
export const ROUTES = {
  home: () => "/",
  login: () => "/auth/login",
  logout: () => "/auth/logout",
  setup: () => "/setup",
  search: () => "/search",
  trash: () => "/trash",
  collection: (slug: string) => `/collection/${slug}`,
  dashboard: (slug: string) => `/dashboard/${slug}`,
  question: (slug?: string) => (slug ? `/question/${slug}` : "/question"),
  model: (slug?: string) => (slug ? `/model/${slug}` : "/model"),
  metric: (slug?: string) => (slug ? `/metric/${slug}` : "/metric"),
  browseModels: () => "/browse/models",
  browseMetrics: () => "/browse/metrics",
  browseDatabases: () => "/browse/databases",
  admin: {
    root: () => "/admin",
    databases: () => "/admin/databases",
    people: () => "/admin/people",
    permissions: () => "/admin/permissions",
    settings: () => "/admin/settings",
  },
} as const;
