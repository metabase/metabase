import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { Database } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type WorkspacesSectionProps = {
  database: Database;
};

export type WorkspacesPlugin = {
  WorkspacesSection: ComponentType<WorkspacesSectionProps>;
  WorkspacesSettingsSection: ComponentType;
};

const getDefaultWorkspaces = (): WorkspacesPlugin => ({
  WorkspacesSection: PluginPlaceholder<WorkspacesSectionProps>,
  WorkspacesSettingsSection: PluginPlaceholder,
});

export const PLUGIN_WORKSPACES = definePluginSlot(getDefaultWorkspaces);
