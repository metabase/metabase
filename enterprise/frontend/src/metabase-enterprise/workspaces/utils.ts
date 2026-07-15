import type { WorkspaceDatabase } from "metabase-types/api";

export function isProvisioned(workspaceDatabase: WorkspaceDatabase) {
  return workspaceDatabase.status === "provisioned";
}

export function isPending(workspaceDatabase: WorkspaceDatabase) {
  const { status } = workspaceDatabase;
  return status === "provisioning" || status === "deprovisioning";
}
