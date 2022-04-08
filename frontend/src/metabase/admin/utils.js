import { UserAuthWrapper } from "redux-auth-wrapper";
import { routerActions } from "react-router-redux";
import { canAccessPath } from "metabase/nav/utils";

export const createAdminRouteGuard = (routeKey, Component) => {
  const Wrapper = UserAuthWrapper({
    predicate: currentUser => canAccessPath(routeKey, currentUser),
    failureRedirectPath: "/unauthorized",
    authSelector: state => state.currentUser,
    allowRedirectBack: false,
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectAction: routerActions.replace,
  });

  return Wrapper(Component ?? (({ children }) => children));
};
