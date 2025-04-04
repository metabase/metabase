import type Database from "metabase-lib/v1/metadata/Database";
import type { Database as DatabaseApi } from "metabase-types/api";

export function isDatabaseTableEditingEnabled(
  database: Database | DatabaseApi,
) {
  return database.settings?.["database-enable-table-editing"] ?? false;
}
