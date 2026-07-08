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

export type WorkspaceInstanceId = number;

// A connected child Metabase instance a workspace can be deployed to. The API
// key used to authenticate against the child is write-only: it is sent when
// connecting or rotating, and never returned by the backend.
export type WorkspaceInstance = {
  id: WorkspaceInstanceId;
  name: string;
  url: string;
  workspace_id: WorkspaceId | null;
  initialized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceInstanceSummary = Pick<
  WorkspaceInstance,
  "id" | "name" | "url" | "initialized_at"
>;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  created_at: string;
  creator_id: UserId;

  creator?: UserInfo | null;
  databases?: WorkspaceDatabase[];
  instance?: WorkspaceInstanceSummary | null;
};

export type CreateWorkspaceRequest = {
  name: string;
  database_ids: DatabaseId[];
  instance_id?: WorkspaceInstanceId | null;
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
  // null releases the currently assigned instance
  instance_id?: WorkspaceInstanceId | null;
};

export type CreateWorkspaceInstanceRequest = {
  name: string;
  url: string;
  api_key: string;
};

export type UpdateWorkspaceInstanceRequest = {
  id: WorkspaceInstanceId;
  name?: string;
  url?: string;
  // omit or send null to keep the stored key
  api_key?: string | null;
};

export type TestWorkspaceInstanceConnectionRequest = {
  // stored credentials of this instance fill in whatever is omitted
  id?: WorkspaceInstanceId;
  url?: string;
  api_key?: string;
};

export type TestWorkspaceInstanceConnectionResponse = {
  ok: boolean;
  message?: string | null;
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
