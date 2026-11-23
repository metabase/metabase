import type {
  Database,
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
} from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";
import { definePluginSlot } from "../slot";

export type WorkspaceDatabaseSectionProps = {
  database: Database;
  settingsAvailable?: Record<string, DatabaseLocalSettingAvailability>;
  updateDatabase: (
    database: { id: DatabaseId } & Partial<DatabaseData>,
  ) => Promise<void>;
};

const getDefaultWorkspaces = () => ({
  WorkspaceDatabaseSection: PluginPlaceholder<WorkspaceDatabaseSectionProps>,
});

export const PLUGIN_WORKSPACES = definePluginSlot(getDefaultWorkspaces);
