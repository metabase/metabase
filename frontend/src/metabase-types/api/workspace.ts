import type { DatabaseId } from "./database";

export type WorkspaceId = number;

export type WorkspaceDatabaseStatus = "provisioned" | "deprovisioned";

export type Workspace = {
  id: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
  created_at: string;
  updated_at: string;
};

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input_schemas: string[];
  output_schema: string;
  status: WorkspaceDatabaseStatus;
};

export type WorkspaceDatabaseDraft = {
  database_id: DatabaseId;
  input_schemas: string[];
  output_schema?: string;
  status?: WorkspaceDatabaseStatus;
};

export type CreateWorkspaceRequest = {
  name: string;
  databases: WorkspaceDatabaseDraft[];
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
  databases?: WorkspaceDatabaseDraft[];
};
