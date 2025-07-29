import type { Database } from "metabase-types/api";

export const DATABASE_TABLE_EDITING_SETTING = "database-enable-table-editing";

export const ENGINE_SUPPORTED_FOR_TABLE_EDITING = new Set([
  "postgres",
  "mysql",
  "h2",
]);

export function isDatabaseTableEditingEnabled(database: Database) {
  return database.settings?.[DATABASE_TABLE_EDITING_SETTING] ?? false;
}
