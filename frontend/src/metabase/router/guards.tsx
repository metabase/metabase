import { type ReactElement, useEffect } from "react";

import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getCanAccessOnboardingPage } from "metabase/selectors/onboarding";
import { getSetting } from "metabase/selectors/settings";
import { isSameOrSiteUrlOrigin, replaceLocation } from "metabase/utils/dom";

import { Navigate } from "./Navigate";
import type { Location } from "./types";
import { useLocation } from "./use-location";

type Props = { children: ReactElement };

/** Paths that are handled by the backend server, not the frontend SPA router. */
export const BACKEND_ONLY_PATH_PREFIXES = ["/oauth/", "/auth/sso/"];

export const isBackendOnlyPath = (path: string): boolean =>
  BACKEND_ONLY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

const getRedirectUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const redirectUrlParam = params.get("redirect");

  return redirectUrlParam != null && isSameOrSiteUrlOrigin(redirectUrlParam)
    ? redirectUrlParam
    : "/";
};

/**
 * `getRedirectUrl` accepts site-url-origin targets as well as same-origin ones,
 * so it can hand back an absolute URL. The SPA router only understands in-app
 * paths, so split the target into the path to navigate to and whether the SPA
 * can serve that origin at all.
 */
const resolveRedirectTarget = (url: string) => {
  const target = new URL(url, window.location.origin);

  return {
    // Absolute, so a full-page redirect is not re-resolved against the current
    // path (a bare `auth/sso/x` would otherwise land under `/auth/login`).
    href: target.href,
    path: `${target.pathname}${target.search}${target.hash}`,
    isInAppOrigin: target.origin === window.location.origin,
  };
};

const NEVER_AUTHENTICATING = () => false;

type GuardSelectors = {
  isAllowed: (state: State) => boolean;
  isAuthenticating?: (state: State) => boolean;
};

/**
 * Builds a route guard component from redux selectors. When access is denied it
 * renders the element from `renderRedirect` instead of the guarded children.
 *
 * While `isAuthenticating` is true the guard renders nothing (no redirect and no
 * children), so a route is not bounced while its auth state is still resolving.
 */
function createGuard(
  { isAllowed, isAuthenticating = NEVER_AUTHENTICATING }: GuardSelectors,
  renderRedirect: (location: Location) => ReactElement | null,
) {
  return function Guard({ children }: Props) {
    const location = useLocation();
    const allowed = useSelector(isAllowed);
    const authenticating = useSelector(isAuthenticating);

    if (allowed) {
      return children;
    }
    if (authenticating) {
      return null;
    }
    return renderRedirect(location);
  };
}

/**
 * Builds a guard that redirects to a fixed path when access is denied, the
 * common case with no `?redirect=` round-trip.
 */
export function createRedirectGuard(
  isAllowed: (state: State) => boolean,
  redirectPath: string,
) {
  return createGuard({ isAllowed }, () => (
    <Navigate to={redirectPath} replace />
  ));
}

function FullPageRedirect({ to }: { to: string }): null {
  useEffect(() => {
    replaceLocation(to);
  }, [to]);
  return null;
}

const loginUrlWithRedirect = (location: Location) => {
  const from = `${location.pathname}${location.search}`;
  const query = new URLSearchParams({ redirect: from }).toString();
  return `/auth/login?${query}`;
};

const MetabaseIsSetup = createRedirectGuard(
  (state) => getSetting(state, "has-user-setup"),
  "/setup",
);

const AvailableInEmbedding = createRedirectGuard(
  (state) => !getIsEmbeddingIframe(state),
  "/unauthorized",
);

const UserIsAuthenticated = createGuard(
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

const UserCanAccessDataModel = createRedirectGuard(
  (state) => PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state),
  "/unauthorized",
);

const UserCanAccessDataStudio = createRedirectGuard(
  (state) => canAccessDataStudio(state),
  "/unauthorized",
);

export const IsAuthenticated = ({ children }: Props) => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>{children}</UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const IsAdmin = ({ children }: Props) => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserIsAdmin>{children}</UserIsAdmin>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const IsNotAuthenticated = ({ children }: Props) => (
  <MetabaseIsSetup>
    <UserIsNotAuthenticated>{children}</UserIsNotAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessSettings = ({ children }: Props) => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessSettings>{children}</UserCanAccessSettings>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessOnboarding = ({ children }: Props) => (
  <UserCanAccessOnboarding>{children}</UserCanAccessOnboarding>
);

// Must be in sync with canAccessDataStudio in frontend/src/metabase/data-studio/selectors.ts
export const CanAccessDataStudio = ({ children }: Props) => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessDataStudio>
        <AvailableInEmbedding>{children}</AvailableInEmbedding>
      </UserCanAccessDataStudio>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessDataModel = ({ children }: Props) => (
  <UserCanAccessDataModel>{children}</UserCanAccessDataModel>
);
