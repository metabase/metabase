import type { DatabaseId } from "./database";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type WorkspaceDatabaseStatus =
  | "unprovisioned"
  | "provisioning"
  | "provisioned"
  | "deprovisioning";

export type WorkspaceDatabaseInput = {
  db: string | null;
  schema: string | null;
};

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input: WorkspaceDatabaseInput[];
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
  input: WorkspaceDatabaseInput[];
};

export type CreateWorkspaceRequest = {
  name: string;
  databases: WorkspaceDatabaseParams[];
};
