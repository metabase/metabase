import { t } from "ttag";

import { setupApplicationPermissionsPlugin } from "metabase/admin/permissions/application-permissions";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { canAccessSettings, canManageSubscriptions } from "./selectors";
import {
  monitoringPermissionAllowedPathGetter,
  settingsPermissionAllowedPathGetter,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
      monitoringPermissionAllowedPathGetter,
    );
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(settingsPermissionAllowedPathGetter);

    setupApplicationPermissionsPlugin();

    PLUGIN_APPLICATION_PERMISSIONS.registerPermission({
      key: "setting",
      columnName: t`Settings access`,
    });
    PLUGIN_APPLICATION_PERMISSIONS.registerPermission({
      key: "monitoring",
      columnName: t`Monitoring access`,
      columnHint: t`This grants access to Tools`,
    });
    PLUGIN_APPLICATION_PERMISSIONS.registerPermission({
      key: "subscription",
      columnName: t`Subscriptions and Alerts`,
    });

    PLUGIN_APPLICATION_PERMISSIONS.selectors.canAccessSettings =
      canAccessSettings;
    PLUGIN_APPLICATION_PERMISSIONS.selectors.canManageSubscriptions =
      canManageSubscriptions;
  }
}
