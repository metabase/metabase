import type { WorkspaceDatabase } from "metabase-types/api";

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
