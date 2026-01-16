import type { DatabaseId } from "./database";
import type { ConcreteTableId, TableId } from "./table";

export interface TableReference {
  id: ConcreteTableId;
  name: string;
  schema?: string | null;
  display_name?: string | null;
}

export interface ExtractTablesRequest {
  database_id: DatabaseId;
  sql: string;
}

export interface ExtractTablesResponse {
  tables: TableReference[];
}

export interface GenerateSqlRequest {
  prompt: string;
  database_id: DatabaseId;
  source_sql?: string;
  table_ids?: TableId[];
}

export interface GenerateSqlResponse {
  parts: Array<{
    type: "code_edit";
    version: number;
    value: {
      buffer_id: string;
      mode: "rewrite";
      value: string;
    };
  }>;
}
