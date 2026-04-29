import type { Database, DatabaseId } from "metabase-types/api";

export function getDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  return new Map(databases.map((database) => [database.id, database]));
}
