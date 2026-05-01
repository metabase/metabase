import type { DatabaseId } from "./database";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  created_at: string;
  creator_id: UserId | null;
  updated_at: string;

  creator?: UserInfo | null;
  databases?: WorkspaceDatabase[];
  access_keys?: WorkspaceAccessKey[];
};

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input_schemas: string[];
};

export type WorkspaceAccessKeyId = number;

export type WorkspaceAccessKey = {
  id: WorkspaceAccessKeyId;
  workspace_id: WorkspaceId;
  name: string;
  created_at: string;
  creator_id: UserId | null;
  updated_at: string;

  creator?: UserInfo | null;
};

export type WorkspaceAccessKeyWithSecret = WorkspaceAccessKey & {
  key: string;
};

export type CreateWorkspaceRequest = {
  name: string;
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name: string;
};

export type CreateWorkspaceDatabaseRequest = {
  workspace_id: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type UpdateWorkspaceDatabaseRequest = {
  workspace_id: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type DeleteWorkspaceDatabaseRequest = {
  workspace_id: WorkspaceId;
  database_id: DatabaseId;
};

export type CreateWorkspaceAccessKeyRequest = {
  workspace_id: WorkspaceId;
  name: string;
};

export type UpdateWorkspaceAccessKeyRequest = {
  workspace_id: WorkspaceId;
  id: WorkspaceAccessKeyId;
  name: string;
};

export type DeleteWorkspaceAccessKeyRequest = {
  workspace_id: WorkspaceId;
  id: WorkspaceAccessKeyId;
};

export type WorkspaceAccessKeyLogId = number;

export type WorkspaceAccessKeyLog = {
  id: WorkspaceAccessKeyLogId;
  workspace_id: WorkspaceId | null;
  workspace_access_key_id: WorkspaceAccessKeyId | null;
  context: string;
  timestamp: string;
  /** Hydrated; null when the workspace was deleted. */
  workspace?: Pick<Workspace, "id" | "name"> | null;
  /** Hydrated; null when the access key was deleted. */
  workspace_access_key?: WorkspaceAccessKey | null;
};

export type ListWorkspaceAccessKeyLogsRequest = {
  id: WorkspaceId;
  offset?: number;
  limit?: number;
};

export type ListWorkspaceAccessKeyLogsResponse = {
  data: WorkspaceAccessKeyLog[];
  limit: number;
  offset: number;
  total: number;
};
