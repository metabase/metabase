import type { ReactNode } from "react";

type WorkspacesPlugin = {
  isEnabled: boolean;
  getWorkspaceAdminRoutes: () => ReactNode;
  getWorkspaceAdminNavItems: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  isEnabled: false,
  getWorkspaceAdminRoutes: () => null,
  getWorkspaceAdminNavItems: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
