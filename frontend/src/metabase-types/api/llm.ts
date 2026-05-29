import type { DatabaseId } from "./database";
import type { TemplateTags } from "./dataset";

export interface ExtractSourcesRequest {
  database_id: DatabaseId;
  sql: string;
  template_tags?: TemplateTags;
}

export interface ExtractSourcesColumn {
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

export interface ExtractSourcesTable {
  id: number;
  name: string;
  schema?: string | null;
  display_name?: string | null;
  description?: string | null;
  columns: ExtractSourcesColumn[];
}

export interface ExtractSourcesResponse {
  tables: ExtractSourcesTable[];
  card_ids: number[];
}
