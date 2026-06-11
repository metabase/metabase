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

export type WorkspaceInstanceId = number;

export type WorkspaceInstance = {
  id: WorkspaceInstanceId;
  name: string;
  workspace_id: WorkspaceId | null;
  url: string;
  created_at: string;
  updated_at: string;
};

export type CreateWorkspaceInstanceRequest = {
  name: string;
  url: string;
  api_key: string;
};

export type UpdateWorkspaceInstanceRequest = {
  id: WorkspaceInstanceId;
  name?: string;
};

export type WorkspaceDeploymentRequest = {
  id: WorkspaceId;
  workspace_instance_id: WorkspaceInstanceId;
};
