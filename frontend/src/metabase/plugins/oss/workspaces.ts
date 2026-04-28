import type { ComponentType, ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { State } from "metabase/redux/store";

type WorkspacesPlugin = {
  isEnabled: boolean;
  canManageWorkspaces: (state: State) => boolean;
  TableRemappingNav: ComponentType;
  getWorkspaceAdminFullWidthRoutes: () => ReactNode;
  getDataStudioWorkspaceRoutes: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  isEnabled: false,
  canManageWorkspaces: () => false,
  TableRemappingNav: PluginPlaceholder,
  getWorkspaceAdminFullWidthRoutes: () => null,
  getDataStudioWorkspaceRoutes: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
