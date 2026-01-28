/**
 * Metabase Routing Module
 *
 * This module contains the React Router v7 migration infrastructure.
 *
 * Structure:
 * - compat/: Compatibility layer for gradual v3 -> v7 migration
 * - components.tsx: Route lifecycle components
 * - routes.tsx: v7 route configuration
 */

// Re-export compatibility layer
export * from "./compat";

// Export route components
export {
  LazyRouteWrapper,
  RouteInitializer,
  ScrollToTopOnNavigation,
  SetupGuard,
} from "./components";

// Export v7 route configuration
export { createRoutes } from "./routes";
