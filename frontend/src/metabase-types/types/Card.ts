/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { VisualizationSettings } from "metabase-types/api/card";
import { DatabaseId } from "./Database";
import { StructuredQuery, NativeQuery } from "./Query";
import { Parameter, ParameterQueryObject } from "./Parameter";

export type CardId = number;

export type UnsavedCard<Query = DatasetQuery> = {
  dataset_query: Query;
  display: string;
  visualization_settings: VisualizationSettings;
  parameters?: Array<Parameter>;

  // If coming from dashboard
  dashboardId?: number;
  dashcardId?: number;

  // Not part of the card API contract, a field used by query builder for showing lineage
  original_card_id?: CardId;
};

export type SavedCard<Query = DatasetQuery> = UnsavedCard<Query> & {
  id: CardId;
  name: string;
  description?: string | null;
  dataset?: boolean;
  can_write: boolean;
  public_uuid: string;
  cache_ttl?: number | null;
  archived?: boolean;
  collection_id?: number | null;

  // Only for native queries
  is_write?: boolean;
  action_id?: number;
};

export type Card<Query = DatasetQuery> = SavedCard<Query> | UnsavedCard<Query>;

export type StructuredDatasetQuery = {
  type: "query";
  database?: DatabaseId;
  query: StructuredQuery;
  parameters?: Array<ParameterQueryObject>;
};

export type NativeDatasetQuery = {
  type: "native";
  database?: DatabaseId;
  native: NativeQuery;
  parameters?: Array<ParameterQueryObject>;
};

/**
 * All possible formats for `dataset_query`
 */
export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;
