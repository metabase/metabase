import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspaceDatabaseSection } from "./components/WorkspaceDatabaseSection";
import { getDataStudioRoutes, getWorkspaceDatabaseRoutes } from "./routes";
import { canManageWorkspaces } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.canManageWorkspaces = canManageWorkspaces;
    PLUGIN_WORKSPACES.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_WORKSPACES.getWorkspaceDatabaseRoutes = getWorkspaceDatabaseRoutes;
    PLUGIN_WORKSPACES.WorkspaceDatabaseSection = WorkspaceDatabaseSection;
  }
}
