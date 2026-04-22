import type { Database, DatabaseId } from "./database";

export type WorkspaceId = number;

export type WorkspaceStatus = "uninitialized" | "initialized";

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

  database?: Database;
};

export type CreateWorkspaceRequest = {
  name: string;
  databases: WorkspaceDatabase[];
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
  databases?: WorkspaceDatabase[];
};
