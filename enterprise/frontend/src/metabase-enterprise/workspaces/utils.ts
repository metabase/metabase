import { hasFeature } from "metabase/admin/databases/utils";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

export function isSupportedDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function toDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  const map = new Map<DatabaseId, Database>();
  for (const database of databases) {
    map.set(database.id, database);
  }
  return map;
}

export function isDatabaseProvisioned(
  database: WorkspaceDatabaseDraft,
): boolean {
  return database.status === "provisioned";
}

export function isDatabaseProvisioning(
  database: WorkspaceDatabaseDraft,
): boolean {
  return database.status === "provisioning";
}

export function isDatabaseUnprovisioning(
  database: WorkspaceDatabaseDraft,
): boolean {
  return database.status === "unprovisioning";
}

export function isDatabaseUnprovisioned(
  database: WorkspaceDatabaseDraft,
): boolean {
  return database.status === "unprovisioned";
}
