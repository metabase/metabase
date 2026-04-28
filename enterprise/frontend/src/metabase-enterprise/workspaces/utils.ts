import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export function toDatabasesById(
  databases: Database[],
): Map<DatabaseId, Database> {
  return new Map(databases.map((database) => [database.id, database]));
}

export function isDatabaseProvisioned(database: WorkspaceDatabase): boolean {
  return database.status === "provisioned";
}

export function isDatabaseProvisioning(database: WorkspaceDatabase): boolean {
  return database.status === "provisioning";
}

export function isDatabaseDeprovisioning(database: WorkspaceDatabase): boolean {
  return database.status === "deprovisioning";
}

export function isDatabaseUnprovisioned(database: WorkspaceDatabase): boolean {
  return database.status === "unprovisioned";
}
