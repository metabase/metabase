import type { DatabaseId } from "./database";

export type WorkspaceInstanceDatabase = {
  id: DatabaseId;
  name: string;
  input_schemas: string[];
  output_schema: string;
};

export type WorkspaceInstance = {
  name: string;
  databases: WorkspaceInstanceDatabase[];
};

export type TableRemappingId = number;

export type TableRemapping = {
  id: TableRemappingId;
  database_id: DatabaseId;
  from_db: string;
  from_schema: string;
  from_table_name: string;
  to_db: string;
  to_schema: string;
  to_table_name: string;
  created_at: string;
};
