import type { DatabaseId } from "./database";

export type WorkspaceRemappingId = number;

export type WorkspaceRemapping = {
  id: WorkspaceRemappingId;
  database_id: DatabaseId;
  from_schema: string;
  from_table_name: string;
  to_schema: string;
  to_table_name: string;
  created_at: string;
};
