import type { EmbeddingParameters } from "metabase/public/lib/types";

import type { Collection, CollectionId, LastEditInfo } from "./collection";
import type {
  DashCardId,
  Dashboard,
  DashboardId,
  DashboardTabId,
} from "./dashboard";
import type { Database, DatabaseId } from "./database";
import type { BaseEntityId } from "./entity-id";
import type { Field } from "./field";
import type { ModerationReview } from "./moderation";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type {
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "./parameters";
import type { DatasetQuery, PublicDatasetQuery } from "./query";
import type { CollectionEssentials } from "./search";
import type { Table, TableId } from "./table";
import type { UserInfo } from "./user";
import type { CardDisplayType, VisualizationDisplay } from "./visualization";
import type { VisualizationSettings } from "./visualization-settings";

export type CardType = "model" | "question" | "metric";

type CreatorInfo = Pick<
  UserInfo,
  "first_name" | "last_name" | "email" | "id" | "common_name"
>;

export interface Card<Q extends DatasetQuery = DatasetQuery>
  extends UnsavedCard<Q> {
  id: CardId;
  entity_id: BaseEntityId;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  type: CardType;
  public_uuid: string | null;

  /* Indicates whether static embedding for this card has been published */
  enable_embedding: boolean;
  embedding_params: EmbeddingParameters | null;
  can_write: boolean;
  can_restore: boolean;
  can_delete: boolean;
  can_manage_db: boolean;
  initially_published_at: string | null;

  database_id?: DatabaseId;
  collection?: Collection | null;
  collection_id: number | null;
  collection_position: number | null;
  dashboard: Pick<Dashboard, "id" | "name"> | null;
  dashboard_id: DashboardId | null;
  dashboard_count: number | null;

  result_metadata: Field[];
  moderation_reviews?: ModerationReview[];
  persisted?: boolean;

  query_average_duration?: number | null;
  last_query_start: string | null;
  average_query_time: number | null;
  cache_ttl: number | null;
  based_on_upload?: TableId | null; // table id of upload table, if any

  archived: boolean;

  creator?: CreatorInfo;
  "last-edit-info"?: LastEditInfo;
  table_id?: TableId;
}

export interface PublicCard {
  id: CardId;
  name: string;
  description: string | null;
  display: CardDisplayType;
  visualization_settings: VisualizationSettings;
  parameters?: Parameter[];
  dataset_query: PublicDatasetQuery;
}

export interface UnsavedCard<Q extends DatasetQuery = DatasetQuery> {
  display: VisualizationDisplay;
  dataset_query: Q;
  parameters?: Parameter[];
  visualization_settings: VisualizationSettings;

  // If coming from dashboard
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;

  // Not part of the card API contract, a field used by query builder for showing lineage
  original_card_id?: number;
}

export type CardId = number;

export type CardFilterOption =
  | "all"
  | "mine"
  | "bookmarked"
  | "database"
  | "table"
  | "recent"
  | "popular"
  | "using_model"
  | "archived";

export type CardQueryMetadata = {
  databases: Database[];
  tables: Table[];
  fields: Field[];
};

export interface ListCardsRequest {
  f?: CardFilterOption;
  model_id?: CardId;
}

export interface GetCardRequest {
  id: CardId;
  context?: "collection";
  ignore_view?: boolean;
  ignore_error?: boolean;
}

export interface CreateCardRequest {
  name: string;
  dataset_query: DatasetQuery;
  display: string;
  visualization_settings: VisualizationSettings;
  type?: CardType;
  parameters?: Parameter[];
  parameter_mappings?: unknown;
  description?: string;
  collection_id?: CollectionId;
  dashboard_id?: DashboardId;
  dashboard_tab_id?: DashboardTabId;
  collection_position?: number;
  result_metadata?: Field[];
  cache_ttl?: number;
}

export interface CreateCardFromCsvRequest {
  collection_id?: CollectionId;
  file: File;
}

export interface UpdateCardRequest {
  id: CardId;
  name?: string;
  parameters?: Parameter[];
  dataset_query?: DatasetQuery;
  type?: CardType;
  display?: string;
  description?: string;
  visualization_settings?: VisualizationSettings;
  archived?: boolean;
  enable_embedding?: boolean;
  embedding_params?: EmbeddingParameters;
  collection_id?: CollectionId | null;
  dashboard_id?: DashboardId | null;
  collection_position?: number;
  result_metadata?: Field[];
  cache_ttl?: number;
  collection_preview?: boolean;
  delete_old_dashcards?: boolean;
}

export type UpdateCardKeyRequest<PropertyKey extends keyof UpdateCardRequest> =
  Required<Pick<UpdateCardRequest, "id" | PropertyKey>>;

export type CardError = {
  field?: string;
  table: string;
  type: "inactive-field" | "inactive-table" | "unknown-field" | "unknown-table";
};

export type InvalidCard = Pick<
  Card,
  | "archived"
  | "collection_id"
  | "collection_position"
  | "dataset_query"
  | "description"
  | "id"
  | "name"
  | "updated_at"
  | "creator"
> & {
  collection: CollectionEssentials;
  collection_preview: boolean;
  entity_id: string;
  errors: CardError[];
  display: CardDisplayType;
};

export type InvalidCardResponse = {
  data: InvalidCard[];
} & PaginationResponse;

export type InvalidCardRequest = {
  sort_direction?: "asc" | "desc";
  sort_column?: string;
  collection_id?: CollectionId | null;
} & PaginationRequest;

export type CardQueryRequest = {
  cardId: CardId;
  dashboardId?: DashboardId;
  collection_preview?: boolean;
  ignore_cache?: boolean;
  parameters?: unknown[];
};

export type GetPublicCard = Pick<Card, "id" | "name" | "public_uuid">;

export type GetEmbeddableCard = Pick<Card, "id" | "name">;

export type GetRemappedCardParameterValueRequest = {
  card_id: CardId;
  parameter_id: ParameterId;
  value: ParameterValueOrArray;
};
