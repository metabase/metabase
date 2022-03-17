import { PLUGIN_GENERAL_PERMISSIONS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import getRoutes from "./routes";
import { t } from "ttag";

if (hasPremiumFeature("advanced_permissions")) {
  PLUGIN_GENERAL_PERMISSIONS.getRoutes = getRoutes;
  PLUGIN_GENERAL_PERMISSIONS.tabs = [{ name: t`General`, value: `general` }];
}
