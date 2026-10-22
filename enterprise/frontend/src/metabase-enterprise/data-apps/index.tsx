import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ManageDataAppGroupsPage } from "./admin/ManageDataAppGroupsPage";
import { ManageDataAppsPage } from "./admin/ManageDataAppsPage";
import { getDataStudioDataAppRoutes } from "./data-studio/routes";
import { getRoutes, registerDataAppsPagePrefetch } from "./host/routes";
import { DataAppsNavbarSection } from "./navbar/DataAppsNavbarSection";

/**
 * Initialize data-apps plugin features.
 *
 * The admin nav item + the upsell live in OSS (so they show on every edition);
 * the EE plugin only provides the real management UI, gated on the `data-apps`
 * token feature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("data-apps")) {
    PLUGIN_DATA_APPS.isEnabled = true;
    PLUGIN_DATA_APPS.getRoutes = getRoutes;
    PLUGIN_DATA_APPS.getDataStudioRoutes = getDataStudioDataAppRoutes;
    PLUGIN_DATA_APPS.ManageDataAppsPage = ManageDataAppsPage;
    PLUGIN_DATA_APPS.ManageDataAppGroupsPage = ManageDataAppGroupsPage;
    PLUGIN_DATA_APPS.MainNavbarSection = DataAppsNavbarSection;
    registerDataAppsPagePrefetch();
  }
}
