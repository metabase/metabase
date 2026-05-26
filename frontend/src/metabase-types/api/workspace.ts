import type { DatabaseId } from "./database";
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
};

export type Workspace = {
  id: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
  created_at: string;
  creator_id: UserId;

  creator?: UserInfo;
};

export type CreateWorkspaceRequest = {
  name: string;
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
};

export type CreateWorkspaceDatabaseRequest = {
  id: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type UpdateWorkspaceDatabaseRequest = {
  id: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type DeleteWorkspaceDatabaseRequest = {
  id: WorkspaceId;
  database_id: DatabaseId;
};
