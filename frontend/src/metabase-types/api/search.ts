import type { UserId } from "metabase-types/api/user";

import type { CardId } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
import type { DatabaseId, InitialSyncStatus } from "./database";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { FieldReference } from "./query";
import type { TableId } from "./table";
import type { CardDisplayType } from "./visualization";

const ENABLED_SEARCH_MODELS = [
  "collection",
  "dashboard",
  "card",
  "dataset",
  "metric",
  "database",
  "table",
  "action",
  "indexed-entity",
] as const;

export const SEARCH_MODELS = [...ENABLED_SEARCH_MODELS, "segment"] as const;

export type EnabledSearchModel = (typeof ENABLED_SEARCH_MODELS)[number];

export type SearchModel = (typeof SEARCH_MODELS)[number];

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
  column?: string;
}

interface BaseSearchResult<
  Id extends SearchResultId,
  Model extends SearchModel,
> {
  id: Id;
  model: Model;
  name: string;
}

export type SearchResponse<
  Id extends SearchResultId = SearchResultId,
  Model extends SearchModel = SearchModel,
  Result extends BaseSearchResult<Id, Model> = SearchResult<Id, Model>,
> = {
  data: Result[];
  models: Model[] | null;
  available_models: SearchModel[];
  table_db_id: DatabaseId | null;
} & PaginationResponse;

export type CollectionEssentials = Pick<
  Collection,
  "id" | "name" | "authority_level" | "type"
> &
  Partial<Pick<Collection, "effective_ancestors">>;

export type SearchResultId =
  | CollectionId
  | CardId
  | DatabaseId
  | TableId
  | DashboardId;

export interface SearchResult<
  Id extends SearchResultId = SearchResultId,
  Model extends SearchModel = SearchModel,
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
  database_name: string | null;
  display: CardDisplayType | null;
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

export type SearchContext =
  | "search-bar"
  | "search-app"
  | "command-palette"
  | "entity-picker";

export type SearchRequest = {
  q?: string;
  archived?: boolean;
  table_db_id?: DatabaseId;
  models?: SearchModel[];
  ids?: SearchResultId[];
  filter_items_in_personal_collection?: "only" | "exclude";
  context?: SearchContext;
  created_at?: string | null;
  created_by?: UserId[] | null;
  last_edited_at?: string | null;
  last_edited_by?: UserId[];
  search_native_query?: boolean | null;
  verified?: boolean | null;
  model_ancestors?: boolean | null;
  include_dashboard_questions?: boolean | null;

  // this should be in ListCollectionItemsRequest but legacy code expects them here
  collection?: CollectionId;
  namespace?: "snippets";
} & PaginationRequest;
