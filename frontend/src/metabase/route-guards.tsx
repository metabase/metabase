import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { metabaseReduxContext } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getAdminPaths } from "metabase/selectors/admin";
import { getCanAccessOnboardingPage } from "metabase/selectors/onboarding";
import { getSetting } from "metabase/selectors/settings";
import { getBasename } from "metabase/utils/basename";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

import { getIsEmbeddingIframe } from "./selectors/embed";
import { canAccessTransforms } from "./transforms/selectors";

type Props = { children: React.ReactElement };

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
 * A redirect target's pathname arrives in one of two shapes: basename-relative
 * (`/oauth/x`) — the convention for every SPA path, including the backend's
 * login redirect (the server sits behind the prefix-stripping proxy and never
 * sees the subpath) — or, parsed out of an absolute URL, already carrying the
 * subpath (`/metabase/oauth/x`). Strip the basename so the SPA router (which
 * prepends it itself) and prefix checks like `isBackendOnlyPath` both see a
 * router path.
 */
export const toRouterPathname = (pathname: string) => {
  const basename = getBasename();
  return basename && pathname.startsWith(`${basename}/`)
    ? pathname.slice(basename.length)
    : pathname;
};

/**
 * The inverse: join the basename back on for a full-page redirect, producing
 * the browser-real URL. String-join, not URL resolution: a leading "/" is
 * *root*-relative and would discard the basename from a URL base.
 */
export const toBrowserUrl = (path: string) =>
  new URL(
    `${getBasename()}/${path.replace(/^\//, "")}`,
    window.location.origin,
  );

const MetabaseIsSetup = connectedReduxRedirect<Props, State>({
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Not a user facing string
  wrapperDisplayName: "MetabaseIsSetup",
  redirectPath: "/setup",
  allowRedirectBack: false,
  authenticatedSelector: (state) => getSetting(state, "has-user-setup"),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const AvailableInEmbedding = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "AvailableInEmbedding",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => !getIsEmbeddingIframe(state),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserIsAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAuthenticated",
  redirectPath: "/auth/login",
  authenticatedSelector: (state) => !!state.currentUser,
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserIsAdmin = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAdmin",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    Boolean(state.currentUser && state.currentUser.is_superuser),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserIsNotAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectPath: () => getRedirectUrl(),
  allowRedirectBack: false,
  authenticatingSelector: (state) =>
    state.auth.loginPending || !state.auth.redirect,
  authenticatedSelector: (state) => !state.currentUser,
  redirectAction: (location: {
    pathname: string;
    query?: Record<string, string>;
  }) => {
    const pathname = toRouterPathname(location.pathname);
    if (isBackendOnlyPath(pathname)) {
      const params = new URLSearchParams(location.query);
      const qs = params.toString();
      const path = qs ? `${pathname}?${qs}` : pathname;
      // Absolute, basename-joined: a root-relative replace would drop the
      // subpath when Metabase is hosted under one.
      window.location.replace(toBrowserUrl(path).href);
      return routerActions.replace("/");
    }
    return routerActions.replace({ ...location, pathname });
  },
  context: metabaseReduxContext,
});

const UserCanAccessSettings = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessSettings",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => (getAdminPaths(state)?.length ?? 0) > 0,
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserCanAccessOnboarding = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessOnboarding",
  redirectPath: "/",
  allowRedirectBack: false,
  authenticatedSelector: (state) => getCanAccessOnboardingPage(state),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserCanAccessDataModel = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessDataModel",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserCanAccessDataStudio = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessDataStudio",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => canAccessDataStudio(state),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

const UserCanAccessTransforms = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessTransforms",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => canAccessTransforms(state),
  redirectAction: routerActions.replace,
  context: metabaseReduxContext,
});

export const IsAuthenticated = MetabaseIsSetup(
  UserIsAuthenticated(({ children }) => children),
);
export const IsAdmin = MetabaseIsSetup(
  UserIsAuthenticated(UserIsAdmin(({ children }) => children)),
);

export const IsNotAuthenticated = MetabaseIsSetup(
  UserIsNotAuthenticated(({ children }) => children),
);

export const CanAccessSettings = MetabaseIsSetup(
  UserIsAuthenticated(UserCanAccessSettings(({ children }) => children)),
);

export const CanAccessOnboarding = UserCanAccessOnboarding(
  ({ children }) => children,
);

// Must be in sync with canAccessDataStudio in frontend/src/metabase/data-studio/selectors.ts
export const CanAccessDataStudio = MetabaseIsSetup(
  UserIsAuthenticated(
    UserCanAccessDataStudio(AvailableInEmbedding(({ children }) => children)),
  ),
);

export const CanAccessDataModel = UserCanAccessDataModel(
  ({ children }) => children,
);

export const CanAccessTransforms = UserCanAccessTransforms(
  ({ children }) => children,
);
