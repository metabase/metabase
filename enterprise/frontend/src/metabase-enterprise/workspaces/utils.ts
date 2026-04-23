import { hasFeature } from "metabase/admin/databases/utils";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

export function isSupportedDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function isDatabaseProvisioned(database: WorkspaceDatabase): boolean {
  return database.status === "provisioned";
}

export function isDatabaseProvisioning(database: WorkspaceDatabase): boolean {
  return database.status === "provisioning";
}

export function isDatabaseUnprovisioning(database: WorkspaceDatabase): boolean {
  return database.status === "unprovisioning";
}

export function isDatabaseUnprovisioned(database: WorkspaceDatabase): boolean {
  return database.status === "unprovisioned";
}
