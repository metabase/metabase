import { useLayoutEffect } from "react";

import { shouldShowTenantsUpsell } from "metabase/admin/people/selectors";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type { AdminPath } from "metabase/redux/store/admin";
import { push, replace } from "metabase/router";
import { createRedirectGuard } from "metabase/router/guards";
import { getAdminPaths } from "metabase/selectors/admin";
import { getSetting } from "metabase/selectors/settings";

export const createAdminRouteGuard = (routeKey: string) =>
  createRedirectGuard(
    (state) =>
      getAdminPaths(state)?.find((path) => path.key === routeKey) != null,
    "/unauthorized",
  );

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

export const createTenantsRouteGuard = () =>
  createRedirectGuard(
    (state) =>
      getAdminPaths(state)?.find((path) => path.key === "people") != null &&
      (getSetting(state, "use-tenants") || shouldShowTenantsUpsell(state)),
    "/admin/people",
  );
