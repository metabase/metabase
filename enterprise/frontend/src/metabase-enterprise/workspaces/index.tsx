import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { AdminDatabaseWorkspacesSection } from "./admin/AdminDatabaseWorkspacesSection";
import { isDatabaseWorkspacesEnabled } from "./settings";

/**
 * Initialize workspaces plugin features.
 */
export function initializePlugin() {
  PLUGIN_WORKSPACES.isDatabaseWorkspacesEnabled = isDatabaseWorkspacesEnabled;
  PLUGIN_WORKSPACES.AdminDatabaseWorkspacesSection =
    AdminDatabaseWorkspacesSection;
}
