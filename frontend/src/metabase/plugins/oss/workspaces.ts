import type { ReactNode } from "react";

type WorkspacesPlugin = {
  isEnabled: boolean;
  getDataStudioWorkspaceRoutes: () => ReactNode;
};

const getDefaultPluginWorkspaces = (): WorkspacesPlugin => ({
  isEnabled: false,
  getDataStudioWorkspaceRoutes: () => null,
});

export const PLUGIN_WORKSPACES: WorkspacesPlugin = getDefaultPluginWorkspaces();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPluginWorkspaces());
}
