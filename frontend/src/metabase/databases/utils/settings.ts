import type { Database } from "metabase-types/api";

export function hasDatabaseTableEditingEnabled(_database: Database) {
  return true;

  // TODO [WRK]: enable this check after it is supported on the BE
  // return database.settings?.["database-enable-table-editing"] ?? false;
}
