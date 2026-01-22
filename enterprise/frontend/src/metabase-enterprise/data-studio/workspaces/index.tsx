import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AdminDatabaseWorkspacesSection } from "./admin/AdminDatabaseWorkspacesSection";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.AdminDatabaseWorkspacesSection =
      AdminDatabaseWorkspacesSection;
  }
}
