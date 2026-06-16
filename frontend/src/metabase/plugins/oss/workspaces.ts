import type { ReactNode } from "react";
import type { RouteComponent } from "react-router";

import type { State } from "metabase/redux/store";
import type { Database } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type WorkspaceDatabaseSectionProps = {
  database: Database;
};

const getDefaultWorkspaces = () => ({
  canManageWorkspaces: (_state: State): boolean => false,
  getDataStudioRoutes: (): ReactNode => null,
  getWorkspaceDatabaseRoutes: (_IsAdmin: RouteComponent): ReactNode => null,
  WorkspaceDatabaseSection: PluginPlaceholder<WorkspaceDatabaseSectionProps>,
});

export const PLUGIN_WORKSPACES = getDefaultWorkspaces();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultWorkspaces());
}
