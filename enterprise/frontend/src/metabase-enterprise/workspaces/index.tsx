import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { AdminDatabaseWorkspacesSection } from "./admin/AdminDatabaseWorkspacesSection";

export function initializePlugin() {
  PLUGIN_WORKSPACES.AdminDatabaseWorkspacesSection =
    AdminDatabaseWorkspacesSection;
}
