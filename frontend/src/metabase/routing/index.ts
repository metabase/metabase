/**
 * Metabase Routing Module
 *
 * This module contains the React Router v7 routing infrastructure.
 *
 * Structure:
 * - types.ts: Route types and adapters
 * - useNavigation.ts, useBlockNavigation.ts: Navigation hooks
 * - RouteGuards.tsx: Route guard components
 * - ModalRouteWrapper.tsx: Modal route utilities
 * - createRouterV7.tsx: Router factory
 * - components.tsx: Route lifecycle components
 * - routes.tsx: v7 route configuration
 */

export { useNavigation } from "./useNavigation";

export {
  AvailableInEmbeddingGuard,
  CanAccessDataStudioGuard,
  CanAccessSettingsGuard,
  IsAdminGuard,
  IsAuthenticatedGuard,
  IsNotAuthenticatedGuard,
  MetabaseIsSetupGuard,
  UserCanAccessDataModelGuard,
  UserCanAccessDataStudioGuard,
  UserCanAccessOnboardingGuard,
  UserCanAccessSettingsGuard,
  UserCanAccessTransformsGuard,
  UserIsAdminGuard,
  UserIsAuthenticatedGuard,
  UserIsNotAuthenticatedGuard,
} from "./RouteGuards";

export { createModalRoute, ModalRouteWrapper } from "./ModalRouteWrapper";

export {
  AppRouterProviderV7,
  createAppRouterV7,
  createNavigationListener,
} from "./createRouterV7";

export { useBlockNavigation } from "./useBlockNavigation";

export type {
  PlainRoute,
  RouteParams,
  RouterAdapter,
  RouterRoute,
} from "./types";

// Export route components
export {
  LazyRouteWrapper,
  RouteInitializer,
  ScrollToTopOnNavigation,
  SetupGuard,
} from "./components";

// Export v7 route configuration
export { createRoutes } from "./routes";
