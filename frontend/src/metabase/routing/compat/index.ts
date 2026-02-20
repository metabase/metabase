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
