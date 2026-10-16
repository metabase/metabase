import { useLayoutEffect } from "react";

import { shouldShowTenantsUpsell } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/redux";
import type { AdminPathKey } from "metabase/redux/store";
import { createRedirectGuard } from "metabase/route-guards";
import { useNavigate } from "metabase/router";
import { getAdminPaths, getHasAdminPath } from "metabase/selectors/admin";
import { getSetting } from "metabase/settings";

export const createAdminRouteGuard = (routeKey: AdminPathKey) =>
  createRedirectGuard(
    (state) => getHasAdminPath(state, routeKey),
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
      getHasAdminPath(state, "people") &&
      (getSetting(state, "use-tenants") || shouldShowTenantsUpsell(state)),
    "/admin/people",
  );
