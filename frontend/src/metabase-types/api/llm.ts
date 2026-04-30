import type { DatabaseId } from "./database";

export interface ExtractTablesRequest {
  database_id: DatabaseId;
  sql: string;
}

export interface ExtractTablesColumn {
  id: number;
  name: string;
  database_type?: string | null;
  description?: string | null;
  semantic_type?: string | null;
  fk_target?: {
    table_name: string;
    field_name: string;
  };
}

export interface ExtractTablesTable {
  id: number;
  name: string;
  schema?: string | null;
  display_name?: string | null;
  description?: string | null;
  columns: ExtractTablesColumn[];
}

export interface ExtractTablesResponse {
  tables: ExtractTablesTable[];
}
