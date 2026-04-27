import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

type WorkspacesPlugin = {
  WorkspacesNav: ComponentType;
  TableRemappingNav: ComponentType;
  getWorkspaceAdminRoutes: () => ReactNode;
  getWorkspaceAdminFullWidthRoutes: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  WorkspacesNav: PluginPlaceholder,
  TableRemappingNav: PluginPlaceholder,
  getWorkspaceAdminRoutes: () => null,
  getWorkspaceAdminFullWidthRoutes: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
