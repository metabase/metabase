import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { canAccessDataStudio } from "metabase/data-studio/selectors";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { metabaseReduxContext } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

import { getCanAccessOnboardingPage } from "./home/selectors";
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
    if (isBackendOnlyPath(location.pathname)) {
      const params = new URLSearchParams(location.query);
      const qs = params.toString();
      const url = qs ? `${location.pathname}?${qs}` : location.pathname;
      window.location.replace(url);
      return routerActions.replace("/");
    }
    return routerActions.replace(location);
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
