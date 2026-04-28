import type { Database, DatabaseId } from "metabase-types/api";

export function toDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  return new Map(databases.map((database) => [database.id, database]));
}
