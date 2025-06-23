import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { MetabaseReduxContext } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

export const createTenantsRouteGuard = () => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: "CanAccessTenants",
    redirectPath: "/admin/people",
    allowRedirectBack: false,
    authenticatedSelector: (state: State) =>
      getAdminPaths(state)?.find((path) => path.key === "people") != null &&
      state.settings.values["use-tenants"],
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  //@ts-expect-error no idea how to type
  return Wrapper(({ children }) => children);
};
