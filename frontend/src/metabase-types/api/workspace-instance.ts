import type { DatabaseId } from "./database";

export type WorkspaceInstanceDatabase = {
  id: DatabaseId;
  name: string;
  input_schemas: string[];
  output_namespace: string;
};

export type WorkspaceInstance = {
  name: string;
  databases: WorkspaceInstanceDatabase[];
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
