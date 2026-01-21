import type { Database } from "metabase-types/api";

export const DATABASE_WORKSPACES_SETTING = "database-enable-workspaces";

export function isDatabaseWorkspacesEnabled(database: Database) {
  return database.settings?.[DATABASE_WORKSPACES_SETTING] ?? false;
}
