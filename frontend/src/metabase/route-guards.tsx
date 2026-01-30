import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import { MetabaseReduxContext } from "metabase/lib/redux";
import {
  PLUGIN_DATA_STUDIO,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { getCanAccessOnboardingPage } from "./home/selectors";
import { getIsEmbeddingIframe } from "./selectors/embed";

type Props = { children: React.ReactElement };

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
  context: MetabaseReduxContext,
});

const AvailableInEmbedding = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "AvailableInEmbedding",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => !getIsEmbeddingIframe(state),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserIsAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAuthenticated",
  redirectPath: "/auth/login",
  authenticatedSelector: (state) => !!state.currentUser,
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserIsAdmin = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAdmin",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    Boolean(state.currentUser && state.currentUser.is_superuser),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserIsNotAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectPath: () => getRedirectUrl(),
  allowRedirectBack: false,
  authenticatingSelector: (state) =>
    state.auth.loginPending || !state.auth.redirect,
  authenticatedSelector: (state) => !state.currentUser,
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserCanAccessSettings = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessSettings",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) => (getAdminPaths(state)?.length ?? 0) > 0,
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserCanAccessOnboarding = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessOnboarding",
  redirectPath: "/",
  allowRedirectBack: false,
  authenticatedSelector: (state) => getCanAccessOnboardingPage(state),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserCanAccessDataModel = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessDataModel",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserCanAccessDataStudio = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessDataStudio",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    PLUGIN_DATA_STUDIO.canAccessDataStudio(state),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
});

const UserCanAccessTransforms = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessTransforms",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: (state) =>
    PLUGIN_TRANSFORMS.canAccessTransforms(state),
  redirectAction: routerActions.replace,
  context: MetabaseReduxContext,
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

// Must be in sync with canAccessDataStudio in enterprise/frontend/src/metabase-enterprise/data-studio/selectors.ts
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
