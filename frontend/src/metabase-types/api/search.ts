import type { UserId } from "metabase-types/api/user";
import type { CardId } from "./card";
import type { Collection } from "./collection";
import type { DatabaseId, InitialSyncStatus } from "./database";
import type { FieldReference } from "./query";
import type { TableId } from "./table";

export type EnabledSearchModelType =
  | "collection"
  | "dashboard"
  | "card"
  | "database"
  | "table"
  | "dataset"
  | "action";

export type SearchModelType =
  | ("segment" | "metric" | "pulse" | "indexed-entity" | "snippet")
  | EnabledSearchModelType;

export interface SearchScore {
  weight: number;
  score: number;
  name:
    | "pinned"
    | "bookmarked"
    | "recency"
    | "dashboard"
    | "model"
    | "official collection score"
    | "verified"
    | "text-consecutivity"
    | "text-total-occurrences"
    | "text-fullness";
  match?: string;
  "match-context-thunk"?: string;
  column?: string;
}

export interface SearchResults {
  data: SearchResult[];
  models: SearchModelType[] | null;
  available_models: SearchModelType[];
  limit: number;
  offset: number;
  table_db_id: DatabaseId | null;
  total: number;
}

export interface SearchResult {
  id: number | undefined;
  name: string;
  model: SearchModelType;
  description: string | null;
  archived: boolean | null;
  collection_position: number | null;
  collection: Pick<Collection, "id" | "name" | "authority_level">;
  table_id: TableId;
  bookmark: boolean | null;
  database_id: DatabaseId;
  pk_ref: FieldReference | null;
  table_schema: string | null;
  collection_authority_level: "official" | null;
  updated_at: string;
  moderated_status: string | null;
  model_id: CardId | null;
  model_name: string | null;
  model_index_id: number | null;
  table_description: string | null;
  table_name: string | null;
  initial_sync_status: InitialSyncStatus | null;
  dashboard_count: number | null;
  context: any; // this might be a dead property
  scores: SearchScore[];
  last_edited_at: string | null;
  last_editor_id: UserId | null;
  last_editor_common_name: string | null;
  creator_id: UserId | null;
  creator_common_name: string | null;
  created_at: string | null;
}

export interface SearchListQuery {
  q?: string;
  models?: SearchModelType | SearchModelType[];
  archived?: boolean;
  table_db_id?: DatabaseId;
  limit?: number;
  offset?: number;
}
