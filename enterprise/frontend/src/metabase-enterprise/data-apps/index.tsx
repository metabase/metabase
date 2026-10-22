import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDataStudioDataAppRoutes } from "./data-studio/routes";
import { getRoutes, registerDataAppsPagePrefetch } from "./host/routes";
import { DataAppsNavbarSection } from "./navbar/DataAppsNavbarSection";

/**
 * Initialize data-apps plugin features, gated on the `data-apps` token feature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("data-apps")) {
    PLUGIN_DATA_APPS.isEnabled = true;
    PLUGIN_DATA_APPS.getRoutes = getRoutes;
    PLUGIN_DATA_APPS.getDataStudioRoutes = getDataStudioDataAppRoutes;
    PLUGIN_DATA_APPS.MainNavbarSection = DataAppsNavbarSection;
    registerDataAppsPagePrefetch();
  }
}
