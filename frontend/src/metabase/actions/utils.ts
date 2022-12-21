import type { Database as IDatabase } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

export const checkDatabaseSupportsActions = (database: Database) =>
  database.hasFeature("actions");

export const checkDatabaseActionsEnabled = (database: IDatabase) =>
  !!database.settings?.["database-enable-actions"];
