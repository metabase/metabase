import type { DatabaseId } from "./database";
import type { TableId } from "./table";

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

export type WorkspaceRemappingId = number;

export type WorkspaceRemapping = {
  id: WorkspaceRemappingId;
  database_id: DatabaseId;
  from_schema: string;
  from_table_name: string;
  from_table_id: TableId | null;
  to_schema: string;
  to_table_name: string;
  to_table_id: TableId | null;
  created_at: string;
};
