import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { MetabaseReduxContext } from "metabase/lib/redux";

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
