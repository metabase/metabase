import type { DatabaseId } from "./database";
import type { TableId } from "./table";

export type ReferencedEntity = { model: "table"; id: TableId };

export interface GenerateSqlRequest {
  prompt: string;
  database_id: DatabaseId;
  source_sql?: string;
  referenced_entities?: ReferencedEntity[];
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
  referenced_entities?: ReferencedEntity[];
}
