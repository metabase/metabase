import { connect } from "react-redux";
import { UserAuthWrapper } from "redux-auth-wrapper";
import { routerActions, push } from "react-router-redux";
import { canAccessPath } from "metabase/nav/utils";
import { getUser } from "metabase/selectors/user";

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

const mapStateToProps = state => ({
  user: getUser(state),
});

const mapDispatchToProps = {
  push,
};

export const createAdminRedirect = (adminPath, nonAdminPath) => {
  const NonAdminRedirectComponent = connect(
    mapStateToProps,
    mapDispatchToProps,
  )(({ user, push, location }) => {
    const path = `${location.pathname}/${
      user.is_superuser ? adminPath : nonAdminPath
    }`;
    push(path);
    return null;
  });

  return NonAdminRedirectComponent;
};
