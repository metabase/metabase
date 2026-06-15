import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DataAppsNav } from "./DataAppsNav";
import { ManageDataAppsPage } from "./ManageDataAppsPage";
import { getRoutes } from "./routes";

/**
 * Initialize data-apps plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("data-apps")) {
    PLUGIN_DATA_APPS.isEnabled = true;
    PLUGIN_DATA_APPS.getRoutes = getRoutes;
    PLUGIN_DATA_APPS.ManageDataAppsPage = ManageDataAppsPage;
    PLUGIN_DATA_APPS.DataAppsNav = DataAppsNav;
  }
}
