import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspaceDatabaseSection } from "./components/WorkspaceDatabaseSection";
import { getAdminConnectionInfoRoutes, getDataStudioRoutes } from "./routes";
import { canManageWorkspaceInstance, canManageWorkspaces } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.canManageWorkspaces = canManageWorkspaces;
    PLUGIN_WORKSPACES.canManageWorkspaceInstance = canManageWorkspaceInstance;
    PLUGIN_WORKSPACES.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_WORKSPACES.getAdminConnectionInfoRoutes =
      getAdminConnectionInfoRoutes;
    PLUGIN_WORKSPACES.WorkspaceDatabaseSection = WorkspaceDatabaseSection;
  }
}
