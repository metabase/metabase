import { connect } from "react-redux";
import { routerActions, replace } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getUser } from "metabase/selectors/user";

export const createAdminRouteGuard = (routeKey, Component) => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectPath: "/unauthorized",
    allowRedirectBack: false,
    authenticatedSelector: state =>
      getAdminPaths(state)?.find(path => path.key === routeKey) != null,
    redirectAction: routerActions.replace,
  });

  return Wrapper(Component ?? (({ children }) => children));
};

const mapStateToProps = state => ({
  user: getUser(state),
});

const mapDispatchToProps = {
  replace,
};

export const createAdminRedirect = (adminPath, nonAdminPath) => {
  const NonAdminRedirectComponent = connect(
    mapStateToProps,
    mapDispatchToProps,
  )(({ user, replace, location }) => {
    const path = `${location.pathname}/${
      user.is_superuser ? adminPath : nonAdminPath
    }`;
    replace(path);
    return null;
  });

  return NonAdminRedirectComponent;
};
