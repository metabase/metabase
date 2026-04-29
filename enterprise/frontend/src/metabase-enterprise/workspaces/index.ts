import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDataStudioWorkspaceInstanceRoutes } from "./instance/routes";
import { getDataStudioWorkspaceManagerRoutes } from "./manager/routes";

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.canAccessWorkspaces = getUserIsAdmin;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceManagerRoutes =
      getDataStudioWorkspaceManagerRoutes;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceInstanceRoutes =
      getDataStudioWorkspaceInstanceRoutes;
  }
}
