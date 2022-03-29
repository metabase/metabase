import { PLUGIN_GENERAL_PERMISSIONS, PLUGIN_REDUCERS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import getRoutes from "./routes";
import { t } from "ttag";
import { canManageSubscriptions } from "./selectors";
import generalPermissionsReducer from "./reducer";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_GENERAL_PERMISSIONS.getRoutes = getRoutes;
  PLUGIN_GENERAL_PERMISSIONS.tabs = [{ name: t`General`, value: `general` }];
  PLUGIN_GENERAL_PERMISSIONS.selectors = {
    canManageSubscriptions,
  };
  PLUGIN_REDUCERS.generalPermissionsPlugin = generalPermissionsReducer;
}
