import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  DatabaseData,
  DatabaseId,
  DatabaseLocalSettingAvailability,
  Database as DatabaseType,
  TableId,
} from "metabase-types/api";

const getDefaultPluginDbRouting = () => ({
  DatabaseRoutingSection: PluginPlaceholder<{
    database: DatabaseType;
  }>,
  getDatabaseNameFieldProps: (_isSlug: boolean) => ({}),
  getDestinationDatabaseRoutes: (_IsAdmin: any): React.ReactElement | null =>
    null,
  useRedirectDestinationDatabase: (
    _database: Pick<DatabaseType, "id" | "router_database_id"> | undefined,
  ): void => {},
  getPrimaryDBEngineFieldState: (
    _database: Pick<Database, "router_user_attribute">,
  ): "default" | "hidden" | "disabled" => "default",
});

export const PLUGIN_DB_ROUTING = getDefaultPluginDbRouting();

const getDefaultPluginDatabaseReplication = () => ({
  DatabaseReplicationSection: PluginPlaceholder<{
    database: DatabaseType;
  }>,
});

export const PLUGIN_DATABASE_REPLICATION =
  getDefaultPluginDatabaseReplication();

const getDefaultPluginTableEditing = () => ({
  isEnabled: () => false,
  isDatabaseTableEditingEnabled: (_database: DatabaseType): boolean => false,
  getRoutes: (): React.ReactElement | null => null,
  getTableEditUrl: (_tableId: TableId, _databaseId: DatabaseId): string => "/",
  AdminDatabaseTableEditingSection: PluginPlaceholder<{
    database: DatabaseType;
    settingsAvailable?: Record<string, DatabaseLocalSettingAvailability>;
    updateDatabase: (
      database: { id: DatabaseId } & Partial<DatabaseData>,
    ) => Promise<void>;
  }>,
});

export const PLUGIN_TABLE_EDITING = getDefaultPluginTableEditing();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DB_ROUTING, getDefaultPluginDbRouting());
  Object.assign(
    PLUGIN_DATABASE_REPLICATION,
    getDefaultPluginDatabaseReplication(),
  );
  Object.assign(PLUGIN_TABLE_EDITING, getDefaultPluginTableEditing());
}
