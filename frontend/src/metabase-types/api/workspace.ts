import type { DatabaseId } from "./database";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type WorkspaceDatabaseStauts =
  | "unprovisioned"
  | "provisioning"
  | "provisioned"
  | "deprovisioning";

export type WorkspaceDatabaseInput = {
  db?: string;
  schema?: string;
};

export type WorkspaceDatabaseParams = {
  database_id: DatabaseId;
  input: WorkspaceDatabaseInput[];
};

export type WorkspaceDatabase = WorkspaceDatabaseParams & {
  status: WorkspaceDatabaseStauts;
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
  databases: WorkspaceDatabaseParams[];
};
