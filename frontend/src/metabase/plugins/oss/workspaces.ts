import type { ReactNode } from "react";

import type { WorkspaceInstance } from "metabase-types/api";

type WorkspacesPlugin = {
  isEnabled: boolean;
  getDataStudioWorkspaceRoutes: () => ReactNode;
  getDataStudioWorkspaceInstanceRoutes: () => ReactNode;
  useCurrentWorkspace: () => {
    currentWorkspace: WorkspaceInstance | null;
    isLoading: boolean;
  };
};

const getDefaultPluginWorkspaces = (): WorkspacesPlugin => ({
  isEnabled: false,
  getDataStudioWorkspaceRoutes: () => null,
  getDataStudioWorkspaceInstanceRoutes: () => null,
  useCurrentWorkspace: () => ({
    currentWorkspace: null,
    isLoading: false,
  }),
});

export const PLUGIN_WORKSPACES: WorkspacesPlugin = getDefaultPluginWorkspaces();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPluginWorkspaces());
}
