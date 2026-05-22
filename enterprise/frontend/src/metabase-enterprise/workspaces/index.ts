import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AdminConnectionInfoSection } from "./components/AdminConnectionInfoSection";
import { getAdminConnectionInfoRoutes, getDataStudioRoutes } from "./routes";
import { canManageWorkspaces, hasActiveWorkspace } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.canManageWorkspaces = canManageWorkspaces;
    PLUGIN_WORKSPACES.hasActiveWorkspace = hasActiveWorkspace;
    PLUGIN_WORKSPACES.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_WORKSPACES.getAdminConnectionInfoRoutes =
      getAdminConnectionInfoRoutes;
    PLUGIN_WORKSPACES.AdminConnectionInfoSection = AdminConnectionInfoSection;
  }
}
