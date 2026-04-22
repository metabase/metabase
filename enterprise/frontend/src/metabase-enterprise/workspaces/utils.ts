import { hasFeature } from "metabase/admin/databases/utils";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

export function isWorkspaceDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function isWorkspaceDatabaseProvisioned(
  database: WorkspaceDatabase,
): boolean {
  return database.status === "provisioned";
}

export function isWorkspaceProvisioned(workspace: Workspace): boolean {
  return workspace.databases.every(isWorkspaceDatabaseProvisioned);
}
