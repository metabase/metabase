import { useLayoutEffect } from "react";

import { shouldShowTenantsUpsell } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/redux";
import { createRedirectGuard } from "metabase/route-guards";
import { useNavigate } from "metabase/router";
import { getAdminPaths } from "metabase/selectors/admin";
import { getSetting } from "metabase/settings";

export const createAdminRouteGuard = (routeKey: string) =>
  createRedirectGuard(
    (state) =>
      getAdminPaths(state)?.find((path) => path.key === routeKey) != null,
    "/unauthorized",
  );

export const RedirectToAllowedSettings = () => {
  const adminItems = useSelector(getAdminPaths);
  const navigate = useNavigate();

  useLayoutEffect(() => {
    navigate(adminItems.length === 0 ? "/unauthorized" : adminItems[0].path, {
      replace: true,
    });
  }, [adminItems, navigate]);

  return null;
};

export const createTenantsRouteGuard = () =>
  createRedirectGuard(
    (state) =>
      getAdminPaths(state)?.find((path) => path.key === "people") != null &&
      (getSetting(state, "use-tenants") || shouldShowTenantsUpsell(state)),
    "/admin/people",
  );
