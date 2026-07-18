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
  instance_url: string | null;

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
