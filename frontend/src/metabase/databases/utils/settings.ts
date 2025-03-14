import type { Database } from "metabase-types/api";

export function hasDatabaseTableEditingEnabled(database: Database) {
  return database.settings?.["database-enable-table-editing"] ?? false;
}
