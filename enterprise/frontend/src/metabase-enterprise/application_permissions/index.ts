import { t } from "ttag";

import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import applicationPermissionsReducer from "./reducer";
import getRoutes from "./routes";
import { canManageSubscriptions } from "./selectors";
import {
  monitoringPermissionAllowedPathGetter,
  settingsPermissionAllowedPathGetter,
} from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(monitoringPermissionAllowedPathGetter);
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(settingsPermissionAllowedPathGetter);

  PLUGIN_APPLICATION_PERMISSIONS.getRoutes = getRoutes;
  PLUGIN_APPLICATION_PERMISSIONS.tabs = [
    { name: t`Application`, value: `application` },
  ];

  PLUGIN_APPLICATION_PERMISSIONS.selectors = {
    canManageSubscriptions,
  };
  PLUGIN_REDUCERS.applicationPermissionsPlugin = applicationPermissionsReducer;
}
