import PropTypes from "prop-types";
import { useLayoutEffect } from "react";
import { push, replace, routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { MetabaseReduxContext, connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const createAdminRouteGuard = (routeKey, Component) => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectPath: "/unauthorized",
    allowRedirectBack: false,
    authenticatedSelector: (state) =>
      getAdminPaths(state)?.find((path) => path.key === routeKey) != null,
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  return Wrapper(Component ?? (({ children }) => children));
};

const mapStateToProps = (state, props) => ({
  adminItems: getAdminPaths(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
  replace,
};

const RedirectToAllowedSettingsInner = ({ adminItems, replace }) => {
  useLayoutEffect(() => {
    replace(adminItems.length === 0 ? "/unauthorized" : adminItems[0].path);
  }, [adminItems, replace]);

  return null;
};

RedirectToAllowedSettingsInner.propTypes = {
  adminItems: PropTypes.arrayOf(PropTypes.shape({ path: PropTypes.string })),
  replace: PropTypes.func.isRequired,
};

export const RedirectToAllowedSettings = connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettingsInner);

export const createTenantsRouteGuard = () => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: "CanAccessTenants",
    redirectPath: "/admin/people",
    allowRedirectBack: false,
    authenticatedSelector: (state) =>
      getAdminPaths(state)?.find((path) => path.key === "people") != null &&
      getSetting(state, "use-tenants"),
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  return Wrapper(({ children }) => children);
};
