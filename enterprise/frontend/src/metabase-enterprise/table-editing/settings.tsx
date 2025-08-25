import type { Database } from "metabase-types/api";

export const DATABASE_TABLE_EDITING_SETTING = "database-enable-table-editing";

export function isDatabaseTableEditingEnabled(database: Database) {
  return database.settings?.[DATABASE_TABLE_EDITING_SETTING] ?? false;
}
