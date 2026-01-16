import type { DatabaseId } from "./database";
import type { FieldId } from "./field";
import type { ConcreteTableId, TableId } from "./table";

export interface ColumnReference {
  id: FieldId;
  name: string;
  database_type?: string | null;
  description?: string | null;
  semantic_type?: string | null;
  fk_target?: {
    table_name: string;
    field_name: string;
  } | null;
  /** Auto-generated metadata string (FK info, sample values, fingerprint stats) */
  metadata?: string | null;
}

export interface TableReference {
  id: ConcreteTableId;
  name: string;
  schema?: string | null;
  display_name?: string | null;
  description?: string | null;
  columns?: ColumnReference[];
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
  column_filters?: Record<number, number[]>;
  /** User-edited column context strings: {table_id: {column_id: context_string}} */
  column_contexts?: Record<number, Record<number, string>>;
  /** User-edited table description strings: {table_id: description_string} */
  table_contexts?: Record<number, string>;
}

export interface GetTableColumnsWithContextRequest {
  table_id: number;
  database_id: DatabaseId;
}

export type GetTableColumnsWithContextResponse = TableReference;

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

export interface GenerateDescriptionsRequest {
  database_id: DatabaseId;
  table_id: TableId;
  column_ids?: FieldId[];
  include_table?: boolean;
}

export interface GenerateDescriptionsResponse {
  table_description?: string;
  column_descriptions: Record<FieldId, string>;
}
