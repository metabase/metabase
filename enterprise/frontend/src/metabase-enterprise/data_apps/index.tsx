import { PLUGIN_DATA_APPS, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getRoutes } from "./routes";

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
    PLUGIN_DATA_APPS.ManageDataAppsPage = lazyPluginComponent(() =>
      import("./admin/ManageDataAppsPage").then(
        ({ ManageDataAppsPage }) => ManageDataAppsPage,
      ),
    );
    PLUGIN_DATA_APPS.MainNavbarSection = lazyPluginComponent(() =>
      import("./navbar/DataAppsNavbarSection").then(
        ({ DataAppsNavbarSection }) => DataAppsNavbarSection,
      ),
    );
  }
}
