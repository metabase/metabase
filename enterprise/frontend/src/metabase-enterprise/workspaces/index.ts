import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { WorkspacesNav } from "./WorkspacesNav";
import { getWorkspaceAdminRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.WorkspacesNav = WorkspacesNav;
    PLUGIN_WORKSPACES.getWorkspaceAdminRoutes = getWorkspaceAdminRoutes;
  }
}
