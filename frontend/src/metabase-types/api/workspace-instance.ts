import type { DatabaseId } from "./database";

export type WorkspaceInstance = {
  name: string;
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
