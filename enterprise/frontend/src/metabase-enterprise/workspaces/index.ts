import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getWorkspaceAdminNavItems, getWorkspaceAdminRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.getWorkspaceAdminRoutes = getWorkspaceAdminRoutes;
    PLUGIN_WORKSPACES.getWorkspaceAdminNavItems = getWorkspaceAdminNavItems;
  }
}
