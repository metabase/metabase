import type { DatabaseId } from "./database";
import type { Table } from "./table";

export type ReferencedEntity = { model: "table" } & Table;

export type ReferencedEntityId = Pick<ReferencedEntity, "id" | "model">;

export interface GenerateSqlRequest {
  prompt: string;
  database_id: DatabaseId;
  source_sql?: string;
  referenced_entities?: ReferencedEntityId[];
}

export interface GenerateSqlResponse {
  sql: string;
  referenced_entities: ReferencedEntity[];
}

export interface ExtractTablesRequest {
  database_id: DatabaseId;
  sql: string;
}

export interface ExtractTablesResponse {
  tables: Table[];
}

export interface LLMModel {
  id: string;
  display_name: string;
}

export interface ListModelsResponse {
  models: LLMModel[];
}
