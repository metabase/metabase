import type { Database } from "metabase-types/api";

export const checkDatabaseSupportsActions = (database: Database) =>
  database.features.includes("actions");

export const checkDatabaseActionsEnabled = (database: Database) =>
  !!database.settings?.["database-enable-actions"];
