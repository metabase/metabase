import { PLUGIN_WORKSPACES } from "metabase/plugins";

import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import {
  getDataStudioWorkspaceInstanceRoutes,
  getDataStudioWorkspaceRoutes,
} from "./routes";

function useCurrentWorkspace() {
  const { data, isLoading } = useGetCurrentWorkspaceQuery();
  return { currentWorkspace: data ?? null, isLoading };
}

export function initializePlugin() {
  PLUGIN_WORKSPACES.isEnabled = true;
  PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes = getDataStudioWorkspaceRoutes;
  PLUGIN_WORKSPACES.getDataStudioWorkspaceInstanceRoutes =
    getDataStudioWorkspaceInstanceRoutes;
  PLUGIN_WORKSPACES.useCurrentWorkspace = useCurrentWorkspace;
}
