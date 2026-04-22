import type { Database, DatabaseId } from "./database";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
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
