import type { UserId } from "metabase-types/api/user";

import type { CardId } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
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
  | "action"
  | "indexed-entity";

export type SearchModelType =
  | ("segment" | "metric" | "snippet")
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

interface BaseSearchResult<
  Id extends SearchResultId,
  Model extends SearchModelType,
> {
  id: Id;
  model: Model;
  name: string;
}

export interface SearchResponse<
  Id extends SearchResultId = SearchResultId,
  Model extends SearchModelType = SearchModelType,
  Result extends BaseSearchResult<Id, Model> = SearchResult<Id, Model>,
> {
  data: Result[];
  models: Model[] | null;
  available_models: SearchModelType[];
  limit: number;
  offset: number;
  table_db_id: DatabaseId | null;
  total: number;
}

export type CollectionEssentials = Pick<
  Collection,
  "id" | "name" | "authority_level"
>;

export type SearchResultId =
  | CollectionId
  | CardId
  | DatabaseId
  | TableId
  | DashboardId;

export interface SearchResult<
  Id extends SearchResultId = SearchResultId,
  Model extends SearchModelType = SearchModelType,
> {
  id: Id;
  name: string;
  model: Model;
  description: string | null;
  archived: boolean | null;
  collection_position: number | null;
  collection: CollectionEssentials;
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
  can_write: boolean | null;
}

export interface SearchRequest {
  q?: string;
  archived?: boolean;
  table_db_id?: DatabaseId;
  models?: SearchModelType | SearchModelType[];
  filter_items_in_personal_collection?: "only" | "exclude";
  context?: "search-bar" | "search-app";
  created_at?: string | null;
  created_by?: UserId[] | null;
  last_edited_at?: string | null;
  last_edited_by?: UserId[];
  search_native_query?: boolean | null;
  verified?: boolean | null;
  limit?: number;
  offset?: number;

  // this should be in ListCollectionItemsRequest but legacy code expects them here
  collection?: CollectionId;
  namespace?: "snippets";
}
