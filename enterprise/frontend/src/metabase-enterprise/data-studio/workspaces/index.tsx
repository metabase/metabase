import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AdminDatabaseWorkspacesSection } from "./admin/AdminDatabaseWorkspacesSection";
import { EditTransformMenu } from "./components/EditTransformMenu";
import { WorkspacesSection } from "./components/WorkspaceSection";
import { getDataStudioWorkspaceRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.AdminDatabaseWorkspacesSection =
      AdminDatabaseWorkspacesSection;
    PLUGIN_WORKSPACES.WorkspacesSection = WorkspacesSection;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes =
      getDataStudioWorkspaceRoutes;
    PLUGIN_WORKSPACES.EditTransformMenu = EditTransformMenu;
  }
}
