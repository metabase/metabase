import type { DatabaseId } from "./database";

export type TableNamespace = {
  db?: string | null;
  schema?: string | null;
};

export type CurrentWorkspaceDatabase = {
  input_schemas: string[];
  output: TableNamespace;
};

export type CurrentWorkspace = {
  name: string;
  databases: Record<DatabaseId, CurrentWorkspaceDatabase>;
  can_write: boolean;
};

export type GetCurrentWorkspaceResponse = {
  data: CurrentWorkspace | null;
};

export type TableRemappingId = number;

export type TableRemapping = {
  id: TableRemappingId;
  database_id: DatabaseId;
  from_db: string | null;
  from_schema: string | null;
  from_table_name: string;
  to_db: string | null;
  to_schema: string | null;
  to_table_name: string;
  created_at: string;
};
