import { hasFeature } from "metabase/admin/databases/utils";
import type { Database, Workspace } from "metabase-types/api";

export function isWorkspaceDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function isWorkspaceProvisioned(workspace: Workspace): boolean {
  return workspace.databases.every(
    (database) => database.status === "provisioned",
  );
}

export function isWorkspaceProvisioning(workspace: Workspace): boolean {
  return workspace.databases.some(
    (database) => database.status === "provisioning",
  );
}

export function isWorkspaceUnprovisioning(workspace: Workspace): boolean {
  return workspace.databases.some(
    (database) => database.status === "unprovisioning",
  );
}

export function isWorkspaceUnprovisioned(workspace: Workspace): boolean {
  return workspace.databases.every(
    (database) => database.status === "unprovisioned",
  );
}
