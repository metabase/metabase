import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getCanAccessOnboardingPage } from "metabase/home/selectors";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_DATA_STUDIO,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { getIsEmbeddingIframe } from "../../selectors/embed";

interface GuardProps {
  children?: ReactNode;
}

/**
 * Get redirect URL from query params, validating it's same origin
 */
const getRedirectUrl = (): string => {
  const params = new URLSearchParams(window.location.search);
  const redirectUrlParam = params.get("redirect");

  return redirectUrlParam != null && isSameOrSiteUrlOrigin(redirectUrlParam)
    ? redirectUrlParam
    : "/";
};

/**
 * Guard that redirects to /setup if Metabase is not set up
 */
export function MetabaseIsSetupGuard({ children }: GuardProps) {
  const hasUserSetup = useSelector((state: State) =>
    getSetting(state, "has-user-setup"),
  );

  if (!hasUserSetup) {
    return <Navigate to="/setup" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that redirects to /unauthorized if in embedding iframe
 */
export function AvailableInEmbeddingGuard({ children }: GuardProps) {
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  if (isEmbeddingIframe) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to be authenticated
 * Redirects to /auth/login if not
 */
export function UserIsAuthenticatedGuard({ children }: GuardProps) {
  const currentUser = useSelector((state: State) => state.currentUser);

  if (!currentUser) {
    return <Navigate to="/auth/login" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to be an admin
 * Redirects to /unauthorized if not
 */
export function UserIsAdminGuard({ children }: GuardProps) {
  const currentUser = useSelector((state: State) => state.currentUser);
  const isAdmin = currentUser?.is_superuser ?? false;

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to NOT be authenticated
 * Redirects to home (or redirect URL) if logged in
 */
export function UserIsNotAuthenticatedGuard({ children }: GuardProps) {
  const currentUser = useSelector((state: State) => state.currentUser);
  const loginPending = useSelector((state: State) => state.auth?.loginPending);
  const authRedirect = useSelector((state: State) => state.auth?.redirect);

  // Still authenticating
  if (loginPending || !authRedirect) {
    return null;
  }

  if (currentUser) {
    return <Navigate to={getRedirectUrl()} replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to have access to settings
 */
export function UserCanAccessSettingsGuard({ children }: GuardProps) {
  const adminPaths = useSelector(getAdminPaths);
  const hasAccess = (adminPaths?.length ?? 0) > 0;

  if (!hasAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to have access to onboarding
 */
export function UserCanAccessOnboardingGuard({ children }: GuardProps) {
  const canAccess = useSelector(getCanAccessOnboardingPage);

  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to have access to data model
 */
export function UserCanAccessDataModelGuard({ children }: GuardProps) {
  const canAccess = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );

  if (!canAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to have access to data studio
 */
export function UserCanAccessDataStudioGuard({ children }: GuardProps) {
  const canAccess = useSelector(PLUGIN_DATA_STUDIO.canAccessDataStudio);

  if (!canAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Guard that requires user to have access to transforms
 */
export function UserCanAccessTransformsGuard({ children }: GuardProps) {
  const canAccess = useSelector(PLUGIN_TRANSFORMS.canAccessTransforms);

  if (!canAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

/**
 * Composed guards matching the existing v3 exports
 *
 * These combine multiple guards in the same way as the v3 HOCs.
 * In route config, wrap components with these guards.
 */

/**
 * IsAuthenticated - Metabase must be set up AND user must be logged in
 */
export function IsAuthenticatedGuard({ children }: GuardProps) {
  return (
    <MetabaseIsSetupGuard>
      <UserIsAuthenticatedGuard>{children}</UserIsAuthenticatedGuard>
    </MetabaseIsSetupGuard>
  );
}

/**
 * IsAdmin - Metabase must be set up AND user must be logged in AND be admin
 */
export function IsAdminGuard({ children }: GuardProps) {
  return (
    <MetabaseIsSetupGuard>
      <UserIsAuthenticatedGuard>
        <UserIsAdminGuard>{children}</UserIsAdminGuard>
      </UserIsAuthenticatedGuard>
    </MetabaseIsSetupGuard>
  );
}

/**
 * IsNotAuthenticated - Metabase must be set up AND user must NOT be logged in
 */
export function IsNotAuthenticatedGuard({ children }: GuardProps) {
  return (
    <MetabaseIsSetupGuard>
      <UserIsNotAuthenticatedGuard>{children}</UserIsNotAuthenticatedGuard>
    </MetabaseIsSetupGuard>
  );
}

/**
 * CanAccessSettings - Metabase must be set up AND user must be logged in AND have settings access
 */
export function CanAccessSettingsGuard({ children }: GuardProps) {
  return (
    <MetabaseIsSetupGuard>
      <UserIsAuthenticatedGuard>
        <UserCanAccessSettingsGuard>{children}</UserCanAccessSettingsGuard>
      </UserIsAuthenticatedGuard>
    </MetabaseIsSetupGuard>
  );
}

/**
 * CanAccessDataStudio - Full composed guard for data studio access
 */
export function CanAccessDataStudioGuard({ children }: GuardProps) {
  return (
    <MetabaseIsSetupGuard>
      <UserIsAuthenticatedGuard>
        <UserCanAccessDataStudioGuard>
          <AvailableInEmbeddingGuard>{children}</AvailableInEmbeddingGuard>
        </UserCanAccessDataStudioGuard>
      </UserIsAuthenticatedGuard>
    </MetabaseIsSetupGuard>
  );
}
