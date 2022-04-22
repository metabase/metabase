import { connect } from "react-redux";
import { UserAuthWrapper } from "redux-auth-wrapper";
import { routerActions, replace } from "react-router-redux";
import { getAdminPaths } from "metabase/admin/app/selectors";
import { getUser } from "metabase/selectors/user";

export const createAdminRouteGuard = (routeKey, Component) => {
  const Wrapper = UserAuthWrapper({
    predicate: paths => paths?.find(path => path.key === routeKey) != null,
    failureRedirectPath: "/unauthorized",
    authSelector: getAdminPaths,
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
