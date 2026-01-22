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
  sql: string;
  referenced_entities: ReferencedEntity[];
}
