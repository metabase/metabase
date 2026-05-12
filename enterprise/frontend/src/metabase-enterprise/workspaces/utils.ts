import type { Database } from "metabase-types/api";

export function getAvailableDatabases(databases: Database[]): Database[] {
  return databases.filter(
    (database) =>
      database.features?.includes("workspace") &&
      !database.is_sample &&
      !database.is_audit,
  );
}
