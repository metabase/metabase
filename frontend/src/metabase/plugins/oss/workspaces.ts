import type { ReactNode } from "react";

import type { State } from "metabase/redux/store";

type WorkspacesPlugin = {
  isEnabled: boolean;
  canAccessWorkspaces: (state: State) => boolean;
  getDataStudioWorkspaceManagerRoutes: () => ReactNode;
  getDataStudioWorkspaceInstanceRoutes: () => ReactNode;
};

const getDefaultPlugin = (): WorkspacesPlugin => ({
  isEnabled: false,
  canAccessWorkspaces: () => false,
  getDataStudioWorkspaceManagerRoutes: () => null,
  getDataStudioWorkspaceInstanceRoutes: () => null,
});

export const PLUGIN_WORKSPACES = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultPlugin());
}
