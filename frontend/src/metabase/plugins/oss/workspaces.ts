import type { ComponentType, ReactNode } from "react";

import type { Database } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type AdminConnectionInfoSectionProps = {
  database: Database;
};

const getDefaultWorkspaces = () => ({
  getDataStudioRoutes: (): ReactNode => null,
  getAdminConnectionInfoRoutes: (_IsAdmin: ComponentType): ReactNode => null,
  AdminConnectionInfoSection:
    PluginPlaceholder<AdminConnectionInfoSectionProps>,
});

export const PLUGIN_WORKSPACES = getDefaultWorkspaces();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WORKSPACES, getDefaultWorkspaces());
}
