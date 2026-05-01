import type { DatabaseId } from "./database";
import type { TableId } from "./table";

export type WorkspaceInstanceDatabase = {
  name: string;
  input_schemas: string[];
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
