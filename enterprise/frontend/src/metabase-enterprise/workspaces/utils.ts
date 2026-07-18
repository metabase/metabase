import { t } from "ttag";

import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

export function getWorkspaceDatabaseName(workspaceDatabase: WorkspaceDatabase) {
  return (
    workspaceDatabase.database?.name ??
    t`Database ${workspaceDatabase.database_id}`
  );
}

export function isProvisioning(workspace: Workspace) {
  return (
    workspace.status === "database-provisioning" ||
    workspace.status === "instance-provisioning"
  );
}

export function isDeprovisioning(workspace: Workspace) {
  return (
    workspace.status === "instance-deprovisioning" ||
    workspace.status === "database-deprovisioning"
  );
}

export function isProvisioned(workspace: Workspace) {
  return workspace.status === "provisioned";
}

export function isDeprovisioned(workspace: Workspace) {
  return workspace.status === "unprovisioned";
}
