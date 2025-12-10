import { PLUGIN_TABLE_EDITING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AdminDatabaseTableEditingSection } from "./admin/AdminDatabaseTableEditingSection";
import { getRoutes } from "./routes";
import { isDatabaseTableEditingEnabled } from "./settings";
import { getTableEditUrl } from "./urls";

/**
 * Initialize table-editing plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("table_data_editing")) {
    PLUGIN_TABLE_EDITING.isEnabled = () => true;
    PLUGIN_TABLE_EDITING.isDatabaseTableEditingEnabled =
      isDatabaseTableEditingEnabled;
    PLUGIN_TABLE_EDITING.getRoutes = getRoutes;
    PLUGIN_TABLE_EDITING.getTableEditUrl = getTableEditUrl;
    PLUGIN_TABLE_EDITING.AdminDatabaseTableEditingSection =
      AdminDatabaseTableEditingSection;
  }
}
