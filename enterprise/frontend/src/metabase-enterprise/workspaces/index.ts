import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { getDataStudioWorkspaceRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_WORKSPACES.isEnabled = true;
  PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes = getDataStudioWorkspaceRoutes;
}
