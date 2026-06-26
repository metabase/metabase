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
  driver: string;
  schema: string;
  user: string;
  reason?: string | null;
};

export type DeleteWorkspaceRequest = {
  id: WorkspaceId;
  // When the workspace has databases still provisioning/deprovisioning, the
  // backend refuses unless this is set — then it leaves those databases'
  // warehouse resources in place and removes only the app-DB rows.
  ignorePending?: boolean;
};

export type DeleteWorkspaceResponse = {
  id: WorkspaceId;
  deleted: boolean;
  // Present only when the warehouse was unreachable during teardown: the workspace
  // is still deleted, but these inert schema/user objects were left behind.
  message?: string;
  orphaned_resources?: OrphanedWorkspaceResource[];
};
