import { t } from "ttag";

import { PLUGIN_APPLICATION_PERMISSIONS_SELECTORS } from "metabase/current-user";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import applicationPermissionsReducer from "./reducer";
import getRoutes from "./routes";
import { canAccessSettings, canManageSubscriptions } from "./selectors";
import {
  monitoringPermissionAllowedPathGetter,
  settingsPermissionAllowedPathGetter,
} from "./utils";

/**
 * Initialize application permissions plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
      monitoringPermissionAllowedPathGetter,
    );
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(settingsPermissionAllowedPathGetter);

    PLUGIN_APPLICATION_PERMISSIONS.getRoutes = getRoutes;
    PLUGIN_APPLICATION_PERMISSIONS.tabs = [
      { name: t`Application`, value: `application` },
    ];

    PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessSettings =
      canAccessSettings;
    PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canManageSubscriptions =
      canManageSubscriptions;
    PLUGIN_REDUCERS.applicationPermissionsPlugin =
      applicationPermissionsReducer;
  }
}
