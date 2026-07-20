import { t } from "ttag";

import type { WorkspaceDatabase } from "metabase-types/api";

export function getWorkspaceDatabaseName(workspaceDatabase: WorkspaceDatabase) {
  return (
    workspaceDatabase.database?.name ??
    t`Database ${workspaceDatabase.database_id}`
  );
}

export function isUnprovisioned(workspaceDatabase: WorkspaceDatabase) {
  return workspaceDatabase.status === "unprovisioned";
}

export function isPending(workspaceDatabase: WorkspaceDatabase) {
  const { status } = workspaceDatabase;
  return status === "provisioning" || status === "deprovisioning";
}

export function getProvisioningFailureMessage() {
  return t`Failed to provision the workspace.`;
}
