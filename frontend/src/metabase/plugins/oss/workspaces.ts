import type { Database } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";
import { definePluginSlot } from "../slot";

export type WorkspaceSchemaSectionProps = {
  database: Database;
};

const getDefaultWorkspaces = () => ({
  WorkspaceSchemaSection: PluginPlaceholder<WorkspaceSchemaSectionProps>,
  WorkspaceToggleSection: PluginPlaceholder,
});

export const PLUGIN_WORKSPACES = definePluginSlot(getDefaultWorkspaces);
