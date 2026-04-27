import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type WorkspacesPlugin = {
  WorkspacesNav: ComponentType;
  getWorkspaceAdminRoutes: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  WorkspacesNav: PluginPlaceholder,
  getWorkspaceAdminRoutes: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
