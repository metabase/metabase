import type { CardId } from "./card";
import type { Collection } from "./collection";
import type { DatabaseId, InitialSyncStatus } from "./database";
import type { FieldReference } from "./query";
import type { TableId } from "./table";

export type SearchModelType =
  | "card"
  | "collection"
  | "dashboard"
  | "database"
  | "dataset"
  | "table"
  | "indexed-entity"
  | "pulse"
  | "segment"
  | "metric"
  | "action"
  | "snippet";

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
  moderated_status: boolean | null;
  model_id: CardId | null;
  model_name: string | null;
  table_description: string | null;
  table_name: string | null;
  initial_sync_status: InitialSyncStatus | null;
  dashboard_count: number | null;
  context: any; // this might be a dead property
  scores: SearchScore[];
}

export interface SearchListQuery {
  q?: string;
  models?: SearchModelType | SearchModelType[];
  archived?: boolean;
  table_db_id?: DatabaseId;
  limit?: number;
  offset?: number;
}
