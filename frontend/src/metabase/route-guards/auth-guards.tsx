import { useEffect } from "react";

import { type Location, Navigate, Outlet } from "metabase/router";
import { getAdminPaths } from "metabase/selectors/admin";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getCanAccessOnboardingPage } from "metabase/selectors/onboarding";
import { getSetting } from "metabase/selectors/settings";
import { replaceLocation } from "metabase/utils/dom";

import { createGuard, createRedirectGuard } from "./create-guard";
import {
  getRedirectUrl,
  isBackendOnlyPath,
  resolveRedirectTarget,
} from "./redirect-target";

function FullPageRedirect({ to }: { to: string }): null {
  useEffect(() => {
    replaceLocation(to);
  }, [to]);
  return null;
}

const loginUrlWithRedirect = (location: Omit<Location, "query" | "action">) => {
  const from = `${location.pathname}${location.search}`;
  const query = new URLSearchParams({ redirect: from }).toString();
  return `/auth/login?${query}`;
};

/**
 * The building blocks features compose their own guards from. A feature guard
 * wraps its access check in `MetabaseIsSetup` + `UserIsAuthenticated` so an
 * unauthenticated visitor lands on login rather than on `/unauthorized`.
 */
export const MetabaseIsSetup = createRedirectGuard(
  (state) => getSetting(state, "has-user-setup"),
  "/setup",
);

export const AvailableInEmbedding = createRedirectGuard(
  (state) => !getIsEmbeddingIframe(state),
  "/unauthorized",
);

export const UserIsAuthenticated = createGuard(
  { isAllowed: (state) => !!state.currentUser },
  (location) => <Navigate to={loginUrlWithRedirect(location)} replace />,
);

const UserIsAdmin = createRedirectGuard(
  (state) => Boolean(state.currentUser && state.currentUser.is_superuser),
  "/unauthorized",
);

const UserIsNotAuthenticated = createGuard(
  {
    isAllowed: (state) => !state.currentUser,
    isAuthenticating: (state) =>
      state.auth.loginPending || !state.auth.redirect,
  },
  () => {
    const { href, path, isInAppOrigin } =
      resolveRedirectTarget(getRedirectUrl());
    const needsFullPageLoad = !isInAppOrigin || isBackendOnlyPath(path);

    return needsFullPageLoad ? (
      <FullPageRedirect to={href} />
    ) : (
      <Navigate to={path} replace />
    );
  },
);

const UserCanAccessSettings = createRedirectGuard(
  (state) => (getAdminPaths(state)?.length ?? 0) > 0,
  "/unauthorized",
);

const UserCanAccessOnboarding = createRedirectGuard(
  (state) => getCanAccessOnboardingPage(state),
  "/",
);

export const IsAuthenticated = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <Outlet />
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const IsAdmin = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserIsAdmin>
        <Outlet />
      </UserIsAdmin>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const IsNotAuthenticated = () => (
  <MetabaseIsSetup>
    <UserIsNotAuthenticated>
      <Outlet />
    </UserIsNotAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessSettings = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessSettings>
        <Outlet />
      </UserCanAccessSettings>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessOnboarding = () => (
  <UserCanAccessOnboarding>
    <Outlet />
  </UserCanAccessOnboarding>
);
