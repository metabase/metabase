import { push, replace, routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { MetabaseReduxContext, connect } from "metabase/lib/redux";

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

const _RedirectToAllowedSettings = ({ adminItems, replace }) => {
  if (adminItems.length === 0) {
    replace("/unauthorized");
  } else {
    replace(adminItems[0].path);
  }

  return null;
};

export const RedirectToAllowedSettings = connect(
  mapStateToProps,
  mapDispatchToProps,
)(_RedirectToAllowedSettings);
