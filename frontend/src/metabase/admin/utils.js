import { connect } from "react-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history4/redirect";
import { routerActions, replace } from "connected-react-router";
import { getAdminPaths } from "metabase/admin/app/selectors";
import { getUser } from "metabase/selectors/user";

export const createAdminRouteGuard = (routeKey, Component) => {
  const Wrapper = connectedReduxRedirect({
    redirectPath: "/unauthorized",
    authenticatedSelector: state =>
      getAdminPaths(state).some(path => path.key === routeKey),
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
