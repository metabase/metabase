import { routerActions } from "connected-react-router";
import { connectedReduxRedirect } from "redux-auth-wrapper/history4/redirect";
import type { State } from "metabase-types/store";
import { getAdminPaths } from "metabase/admin/app/selectors";
import { getIsMetabotEnabled } from "metabase/home/selectors";
import MetabaseSettings from "metabase/lib/settings";

const MetabaseIsSetup = connectedReduxRedirect<unknown, State>({
  redirectPath: "/setup",
  authenticatedSelector: () => Boolean(MetabaseSettings.hasUserSetup()), // HACK
  wrapperDisplayName: "MetabaseIsSetup",
  allowRedirectBack: false,
  redirectAction: routerActions.replace,
});

const UserIsAuthenticated = connectedReduxRedirect<unknown, State>({
  redirectPath: "/auth/login",
  authenticatedSelector: state => Boolean(state.currentUser),
  wrapperDisplayName: "UserIsAuthenticated",
  redirectAction: routerActions.replace,
});

const UserIsAdmin = connectedReduxRedirect<unknown, State>({
  redirectPath: "/unauthorized",
  authenticatedSelector: state => Boolean(state.currentUser?.is_superuser),
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsAdmin",
  redirectAction: routerActions.replace,
});

const UserIsNotAuthenticated = connectedReduxRedirect<unknown, State>({
  redirectPath: "/",
  authenticatedSelector: state => !state.currentUser,
  authenticatingSelector: state => state.auth.loginPending,
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectAction: routerActions.replace,
});

const UserCanAccessSettings = connectedReduxRedirect<unknown, State>({
  redirectPath: "/unauthorized",
  authenticatedSelector: state => getAdminPaths(state)?.length > 0,
  allowRedirectBack: false,
  wrapperDisplayName: "UserCanAccessSettings",
  redirectAction: routerActions.replace,
});

export const UserCanAccessMetabot = connectedReduxRedirect<unknown, State>({
  redirectPath: "/",
  authenticatedSelector: getIsMetabotEnabled,
  allowRedirectBack: false,
  wrapperDisplayName: "UserCanAccessMetabot",
  redirectAction: routerActions.replace,
});

export const IsAuthenticated = MetabaseIsSetup(
  UserIsAuthenticated(({ children }) => <>{children}</>),
);
export const IsAdmin = MetabaseIsSetup(
  UserIsAuthenticated(UserIsAdmin(({ children }) => <>{children}</>)),
);

export const IsNotAuthenticated = MetabaseIsSetup(
  UserIsNotAuthenticated(({ children }) => <>{children}</>),
);

export const CanAccessSettings = MetabaseIsSetup(
  UserIsAuthenticated(UserCanAccessSettings(({ children }) => <>{children}</>)),
);

export const CanAccessMetabot = UserCanAccessMetabot(({ children }) => (
  <>{children}</>
));
