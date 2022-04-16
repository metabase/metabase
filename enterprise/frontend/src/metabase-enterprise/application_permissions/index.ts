import {
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import getRoutes from "./routes";
import { t } from "ttag";
import { canManageSubscriptions } from "./selectors";
import applicationPermissionsReducer from "./reducer";
import { NAV_PERMISSION_GUARD } from "metabase/nav/utils";
import { canAccessMonitoringItems, canAccessSettings } from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  NAV_PERMISSION_GUARD["audit"] = canAccessMonitoringItems;
  NAV_PERMISSION_GUARD["tools"] = canAccessMonitoringItems;
  NAV_PERMISSION_GUARD["troubleshooting"] = canAccessMonitoringItems;
  NAV_PERMISSION_GUARD["settings"] = canAccessSettings;

  PLUGIN_APPLICATION_PERMISSIONS.getRoutes = getRoutes;
  PLUGIN_APPLICATION_PERMISSIONS.tabs = [
    { name: t`Application`, value: `application` },
  ];

  PLUGIN_APPLICATION_PERMISSIONS.selectors = {
    canManageSubscriptions,
  };
  PLUGIN_REDUCERS.applicationPermissionsPlugin = applicationPermissionsReducer;
}
