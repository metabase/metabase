import type { ReactNode } from "react";

import type { State } from "metabase/redux/store";

type WorkspacesPlugin = {
  isEnabled: boolean;
  canManageWorkspaces: (state: State) => boolean;
  getDataStudioWorkspaceRoutes: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  isEnabled: false,
  canManageWorkspaces: () => false,
  getDataStudioWorkspaceRoutes: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
