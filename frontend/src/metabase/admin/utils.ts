import { useLayoutEffect } from "react";
import { push, replace, routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { MetabaseReduxContext, connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import type { AdminPath } from "metabase-types/store/admin";

export const createAdminRouteGuard = (routeKey: string) => {
  const Wrapper = connectedReduxRedirect<any, State>({
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectPath: "/unauthorized",
    allowRedirectBack: false,
    authenticatedSelector: (state) =>
      getAdminPaths(state)?.find((path) => path.key === routeKey) != null,
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  return Wrapper(({ children }) => children);
};

const mapStateToProps = (state: State, props: { location: Location }) => ({
  adminItems: getAdminPaths(state),
  path: props.location.pathname,
});

const mapDispatchToProps = {
  push,
  replace,
};

interface RedirectToAllowedSettingsInnerProps {
  adminItems: AdminPath[];
  replace: (path: string) => void;
}

const RedirectToAllowedSettingsInner = ({
  adminItems,
  replace,
}: RedirectToAllowedSettingsInnerProps) => {
  useLayoutEffect(() => {
    replace(adminItems.length === 0 ? "/unauthorized" : adminItems[0].path);
  }, [adminItems, replace]);

  return null;
};

export const RedirectToAllowedSettings = connect(
  mapStateToProps,
  mapDispatchToProps,
)(RedirectToAllowedSettingsInner);

export const createTenantsRouteGuard = () => {
  const Wrapper = connectedReduxRedirect<any, State>({
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
