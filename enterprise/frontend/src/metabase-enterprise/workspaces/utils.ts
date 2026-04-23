import { hasFeature } from "metabase/admin/databases/utils";
import type { Database, WorkspaceDatabaseDraft } from "metabase-types/api";

export function isSupportedDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
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
