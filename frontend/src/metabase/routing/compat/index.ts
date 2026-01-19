/**
 * React Router Compatibility Layer
 *
 * This module provides hooks and utilities that work with both React Router v3 and v7,
 * enabling a gradual migration from v3 to v7.
 *
 * Feature flags in ./config.ts control which router version is used for each feature.
 *
 * Usage:
 * ```tsx
 * import {
 *   useNavigation,
 *   useCompatLocation,
 *   useCompatParams,
 * } from "metabase/routing/compat";
 *
 * function MyComponent() {
 *   const { push, replace, goBack } = useNavigation();
 *   const location = useCompatLocation();
 *   const params = useCompatParams<{ id: string }>();
 *
 *   // Works with both v3 and v7
 *   const handleClick = () => push(`/item/${params.id}`);
 * }
 * ```
 *
 * Migration Strategy:
 * 1. Replace direct imports from "react-router" and "react-router-redux" with these compat hooks
 * 2. Replace withRouter HOC usage with these hooks
 * 3. Once all usages are migrated, flip the feature flags to use v7
 * 4. Remove the compat layer and use react-router-dom directly
 */

export {
  USE_REACT_ROUTER_V7,
  USE_V7_LOCATION,
  USE_V7_NAVIGATION,
  USE_V7_PARAMS,
  USE_V7_ROUTE_GUARDS,
} from "./config";
export {
  useCompatLocation,
  useCompatSearchParams,
  type CompatLocation,
} from "./useCompatLocation";
export { useCompatParams } from "./useCompatParams";
export { useNavigation } from "./useNavigation";

// Route Guards for v7
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

// Modal Route for v7
export { createModalRoute, ModalRouteWrapper } from "./ModalRouteWrapper";

// v7 Router Factory
export {
  AppRouterProviderV7,
  createAppRouterV7,
  createNavigationListener,
} from "./createRouterV7";

// Navigation blocking
export { useBlockNavigation } from "./useBlockNavigation";
