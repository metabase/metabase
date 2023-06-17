import { routerActions } from "react-router-redux";
import { UserAuthWrapper } from "redux-auth-wrapper";
import MetabaseSettings from "metabase/lib/settings";
import { getAdminPaths } from "metabase/admin/app/selectors";

const MetabaseIsSetup = UserAuthWrapper({
  predicate: authData => authData.hasUserSetup,
  failureRedirectPath: "/setup",
  authSelector: state => ({ hasUserSetup: MetabaseSettings.hasUserSetup() }), // HACK
  wrapperDisplayName: "MetabaseIsSetup",
  allowRedirectBack: false,
  redirectAction: routerActions.replace,
});

const UserIsAuthenticated = UserAuthWrapper({
  failureRedirectPath: "/auth/login",
  authSelector: state => state.currentUser,
  wrapperDisplayName: "UserIsAuthenticated",
  redirectAction: routerActions.replace,
});

const UserIsAdmin = UserAuthWrapper({
  predicate: currentUser => currentUser && currentUser.is_superuser,
  failureRedirectPath: "/unauthorized",
  authSelector: state => state.currentUser,
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsAdmin",
  redirectAction: routerActions.replace,
});

const UserIsNotAuthenticated = UserAuthWrapper({
  predicate: currentUser => !currentUser,
  failureRedirectPath: "/",
  authSelector: state => state.currentUser,
  authenticatingSelector: state => state.auth.loginPending,
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectAction: routerActions.replace,
});

const UserCanAccessSettings = UserAuthWrapper({
  predicate: adminItems => adminItems?.length > 0,
  failureRedirectPath: "/unauthorized",
  authSelector: getAdminPaths,
  allowRedirectBack: false,
  wrapperDisplayName: "UserCanAccessSettings",
  redirectAction: routerActions.replace,
});

export const UserCanAccessMetabot = UserAuthWrapper({
  predicate: isMetabotEnabled => true, // FIXME [AL]: fix this guard
  failureRedirectPath: "/",
  authSelector: () => MetabaseSettings.isMetabotEnabled(),
  allowRedirectBack: false,
  wrapperDisplayName: "UserCanAccessMetabot",
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
