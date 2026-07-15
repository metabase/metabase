import type { Database, DatabaseId } from "./database";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type WorkspaceDatabaseStatus =
  | "unprovisioned"
  | "provisioning"
  | "provisioned"
  | "deprovisioning";

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input_schemas: string[];
  status: WorkspaceDatabaseStatus;

  database?: Database | null;
};

export type Workspace = {
  id: WorkspaceId;
  name: string;
  created_at: string;
  creator_id: UserId;

  creator?: UserInfo | null;
  databases?: WorkspaceDatabase[];
};

export type CreateWorkspaceRequest = {
  name: string;
  database_ids: DatabaseId[];
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
};

export type OrphanedWorkspaceResource = {
  workspace_database_id: number;
  database_id: DatabaseId;
  // Absent when the teardown failed before the warehouse identifiers were known
  // (e.g. a lock timeout).
  driver?: string;
  schema?: string | null;
  user?: string | null;
  reason?: string | null;
};

export type DeleteWorkspaceRequest = {
  id: WorkspaceId;
};

export type DeleteWorkspaceResponse = {
  id: WorkspaceId;
  deleted: boolean;
  // Present only when some databases' warehouse teardown failed: the workspace is
  // kept (`deleted: false`) so the delete can be retried, and `message` carries
  // the joined failure reasons.
  message?: string;
  orphaned_resources?: OrphanedWorkspaceResource[];
};
