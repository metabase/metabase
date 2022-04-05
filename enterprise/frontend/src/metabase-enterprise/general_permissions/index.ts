import { PLUGIN_GENERAL_PERMISSIONS, PLUGIN_REDUCERS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import getRoutes from "./routes";
import { t } from "ttag";
import { canManageSubscriptions } from "./selectors";
import generalPermissionsReducer from "./reducer";
import { NAV_PERMISSION_GUARD } from "metabase/nav/utils";
import { canAccessMonitoringItems } from "./utils";

if (hasPremiumFeature("advanced_permissions")) {
  NAV_PERMISSION_GUARD["audit"] = canAccessMonitoringItems as any;
  NAV_PERMISSION_GUARD["tools"] = canAccessMonitoringItems as any;
  NAV_PERMISSION_GUARD["troubleshooting"] = canAccessMonitoringItems as any;

  PLUGIN_GENERAL_PERMISSIONS.getRoutes = getRoutes;
  PLUGIN_GENERAL_PERMISSIONS.tabs = [{ name: t`General`, value: `general` }];
  PLUGIN_GENERAL_PERMISSIONS.selectors = {
    canManageSubscriptions,
  };
  PLUGIN_REDUCERS.generalPermissionsPlugin = generalPermissionsReducer;
}
