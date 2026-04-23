import { PLUGIN_WORKSPACES } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getDataStudioWorkspaceInstanceRoutes,
  getDataStudioWorkspaceRoutes,
} from "./routes";

function useCurrentWorkspace() {
  const { data, isLoading } = useGetCurrentWorkspaceQuery();
  return { currentWorkspace: data ?? null, isLoading };
}

export function initializePlugin() {
  if (hasPremiumFeature("workspaces") || hasPremiumFeature("hosting")) {
    PLUGIN_WORKSPACES.isEnabled = true;
    PLUGIN_WORKSPACES.canManageWorkspaces = getUserIsAdmin;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes =
      getDataStudioWorkspaceRoutes;
    PLUGIN_WORKSPACES.getDataStudioWorkspaceInstanceRoutes =
      getDataStudioWorkspaceInstanceRoutes;
    PLUGIN_WORKSPACES.useCurrentWorkspace = useCurrentWorkspace;
  }
}
