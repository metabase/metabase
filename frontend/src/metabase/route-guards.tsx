import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getIsMetabotEnabled } from "metabase/home/selectors";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

type Props = { children: React.ReactElement };

const MetabaseIsSetup = connectedReduxRedirect<Props, State>({
  // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
  wrapperDisplayName: "MetabaseIsSetup",
  redirectPath: "/setup",
  allowRedirectBack: false,
  authenticatedSelector: state => getSetting(state, "has-user-setup"),
  redirectAction: routerActions.replace,
});

const UserIsAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAuthenticated",
  redirectPath: "/auth/login",
  authenticatedSelector: state => !!state.currentUser,
  redirectAction: routerActions.replace,
});

const UserIsAdmin = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsAdmin",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: state =>
    Boolean(state.currentUser && state.currentUser.is_superuser),
  redirectAction: routerActions.replace,
});

const UserIsNotAuthenticated = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectPath: "/",
  allowRedirectBack: false,
  authenticatingSelector: state => state.auth.loginPending,
  authenticatedSelector: state => !state.currentUser,
  redirectAction: routerActions.replace,
});

const UserCanAccessSettings = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessSettings",
  redirectPath: "/unauthorized",
  allowRedirectBack: false,
  authenticatedSelector: state => (getAdminPaths(state)?.length ?? 0) > 0,
  redirectAction: routerActions.replace,
});

export const UserCanAccessMetabot = connectedReduxRedirect<Props, State>({
  wrapperDisplayName: "UserCanAccessMetabot",
  redirectPath: "/",
  allowRedirectBack: false,
  authenticatedSelector: state => getIsMetabotEnabled(state),
  redirectAction: routerActions.replace,
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

export const CanAccessMetabot = UserCanAccessMetabot(
  ({ children }) => children,
);
