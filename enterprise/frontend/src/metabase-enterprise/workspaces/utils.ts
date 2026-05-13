import type { Database, DatabaseId } from "metabase-types/api";

export function getDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  return new Map(databases.map((database) => [database.id, database]));
}

export function getAvailableDatabases(databases: Database[]): Database[] {
  return databases.filter(
    (database) =>
      database.features?.includes("workspace") &&
      !database.is_sample &&
      !database.is_audit,
  );
}
