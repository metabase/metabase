import type { DatabaseId } from "./database";
import type { TableId } from "./table";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
  created_at: string;
  updated_at: string;

  creator_id: UserId | null;
  creator?: UserInfo | null;
};

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input_schemas: string[];
  output_schema?: string;
};

export type CreateWorkspaceRequest = {
  name: string;
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name: string;
};

export type CreateWorkspaceDatabaseRequest = {
  workspaceId: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type UpdateWorkspaceDatabaseRequest = {
  workspaceId: WorkspaceId;
  database_id: DatabaseId;
  input_schemas: string[];
};

export type DeleteWorkspaceDatabaseRequest = {
  workspaceId: WorkspaceId;
  database_id: DatabaseId;
};

export type WorkspaceInstanceDatabase = {
  name: string;
  input_schemas: string[];
  output_schema: string;
};

export type WorkspaceInstance = {
  name: string;
  databases: Record<DatabaseId, WorkspaceInstanceDatabase>;
  remappings_count: number;
};

export type TableRemappingId = number;

export type TableRemapping = {
  id: TableRemappingId;
  database_id: DatabaseId;
  from_schema: string;
  from_table_name: string;
  from_table_id: TableId | null;
  to_schema: string;
  to_table_name: string;
  to_table_id: TableId | null;
  created_at: string;
};
