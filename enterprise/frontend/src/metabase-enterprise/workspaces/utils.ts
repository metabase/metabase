import { hasFeature } from "metabase/common/utils/database";
import type { Database, DatabaseId } from "metabase-types/api";

export function getDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  return new Map(databases.map((database) => [database.id, database]));
}

export function supportsWorkspaces(database: Database): boolean {
  return (
    hasFeature(database, "workspace") &&
    !database.is_sample &&
    !database.is_audit
  );
}
