import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getDataStudioWorkspaceInstanceRoutes,
  getDataStudioWorkspaceRoutes,
} from "./routes";

function useCurrentWorkspace() {
  // TODO remove this function, add a setting to indicate if there is a current workspace
  const { data: _data, isLoading } = useGetCurrentWorkspaceQuery();
  return { currentWorkspace: null, isLoading };
}

export function initializePlugin() {
  if (hasPremiumFeature("workspaces")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.canManageWorkspaces = getUserIsAdmin;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes =
      getDataStudioWorkspaceRoutes;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceInstanceRoutes =
      getDataStudioWorkspaceInstanceRoutes;
    PLUGIN_WORKSPACES.useCurrentWorkspace = useCurrentWorkspace;
  }
}
