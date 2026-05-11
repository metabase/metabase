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

export type WorkspaceDatabaseParams = {
  database_id: DatabaseId;
  input_schemas: string[];
};

export type CreateWorkspaceRequest = {
  name: string;
  databases: WorkspaceDatabaseParams[];
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
  databases?: WorkspaceDatabaseParams[];
};
