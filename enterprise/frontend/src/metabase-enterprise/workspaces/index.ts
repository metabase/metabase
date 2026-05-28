import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AdminConnectionInfoSection } from "./components/AdminConnectionInfoSection";
import { DevelopmentInstanceSection } from "./components/DevelopmentInstanceSection";
import { getAdminConnectionInfoRoutes, getDataStudioRoutes } from "./routes";
import {
  canAccessDevelopmentInstanceSettings,
  canManageWorkspaceInstance,
  canManageWorkspaces,
  getIsDevelopmentInstance,
} from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.canManageWorkspaces = canManageWorkspaces;
    PLUGIN_WORKSPACES.canManageWorkspaceInstance = canManageWorkspaceInstance;
    PLUGIN_WORKSPACES.canAccessDevelopmentInstanceSettings =
      canAccessDevelopmentInstanceSettings;
    PLUGIN_WORKSPACES.getIsDevelopmentInstance = getIsDevelopmentInstance;
    PLUGIN_WORKSPACES.getDataStudioRoutes = getDataStudioRoutes;
    PLUGIN_WORKSPACES.getAdminConnectionInfoRoutes =
      getAdminConnectionInfoRoutes;
    PLUGIN_WORKSPACES.AdminConnectionInfoSection = AdminConnectionInfoSection;
    PLUGIN_WORKSPACES.DevelopmentInstanceSection = DevelopmentInstanceSection;
  }
}
