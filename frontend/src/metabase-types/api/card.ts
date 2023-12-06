import type { EmbeddingParameters } from "metabase/public/lib/types";

import type { Collection } from "./collection";
import type { DashboardId, DashCardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { Field } from "./field";
import type { Parameter } from "./parameters";
import type {
  DatasetQuery,
  DimensionReference,
  FieldReference,
  PublicDatasetQuery,
} from "./query";
import type { UserInfo } from "./user";
import type { SmartScalarComparison } from "./visualization-settings";

export type CardType = "model" | "question";

export interface Card<Q extends DatasetQuery = DatasetQuery>
  extends UnsavedCard<Q> {
  id: CardId;
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
  initially_published_at: string | null;

  database_id?: DatabaseId;
  collection?: Collection | null;
  collection_id: number | null;
  collection_position: number | null;

  result_metadata: Field[];
  moderation_reviews?: ModerationReview[];

  query_average_duration?: number | null;
  last_query_start: string | null;
  average_query_time: number | null;
  cache_ttl: number | null;
  based_on_upload?: number | null; // table id of upload table, if any

  archived: boolean;

  creator?: UserInfo;
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

export type CardDisplayType = string;

export interface UnsavedCard<Q extends DatasetQuery = DatasetQuery> {
  display: CardDisplayType;
  dataset_query: Q;
  parameters?: Parameter[];
  visualization_settings: VisualizationSettings;

  // If coming from dashboard
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;

  // Not part of the card API contract, a field used by query builder for showing lineage
  original_card_id?: number;
}

export type SeriesSettings = {
  title?: string;
  color?: string;
  show_series_values?: boolean;
  display?: string;
  axis?: string;
  "line.interpolate"?: string;
  "line.marker_enabled"?: boolean;
  "line.missing"?: string;
};

export type SeriesOrderSetting = {
  name: string;
  key: string;
  enabled: boolean;
  color?: string;
};

export type ColumnFormattingSetting = {
  columns: string[]; // column names
  color?: string;
  type?: string;
  operator?: string;
  value?: string | number;
  highlight_row?: boolean;
};

export type PivotTableCollapsedRowsSetting = {
  rows: FieldReference[];
  value: string[]; // identifiers for collapsed rows
};

export type TableColumnOrderSetting = {
  name: string;
  key: string;
  enabled: boolean;

  // We have some corrupted visualization settings where both names are mixed
  // We should settle on `fieldRef`, make it required and remove `field_ref`
  fieldRef?: DimensionReference;
  field_ref?: DimensionReference;
};

export type VisualizationSettings = {
  "graph.show_values"?: boolean;
  "stackable.stack_type"?: "stacked" | "normalized" | null;

  // Table
  "table.columns"?: TableColumnOrderSetting[];

  // X-axis
  "graph.x_axis.title_text"?: string;
  "graph.x_axis.scale"?: "ordinal" | "timeseries" | "linear" | "histogram";
  "graph.x_axis.axis_enabled"?:
    | true
    | false
    | "compact"
    | "rotate-45"
    | "rotate-90";

  // Y-axis
  "graph.y_axis.title_text"?: string;
  "graph.y_axis.scale"?: "linear" | "pow" | "log";
  "graph.y_axis.axis_enabled"?: true;

  // Goal
  "graph.goal_value"?: number;
  "graph.show_goal"?: boolean;
  "graph.goal_label"?: string;

  // Trend
  "graph.show_trendline"?: boolean;

  // Series
  "graph.dimensions"?: string[];
  "graph.metrics"?: string[];

  // Series settings
  series_settings?: Record<string, SeriesSettings>;

  "graph.series_order"?: SeriesOrderSetting[];

  // Funnel settings
  "funnel.rows"?: SeriesOrderSetting[];

  "table.column_formatting"?: ColumnFormattingSetting[];
  "pivot_table.collapsed_rows"?: PivotTableCollapsedRowsSetting;

  // Scalar Settings
  "scalar.comparisons"?: SmartScalarComparison[];
  "scalar.field"?: string;
  "scalar.switch_positive_negative"?: boolean;
  "scalar.compact_primary_number"?: boolean;

  [key: string]: any;
};

export interface ModerationReview {
  moderator_id: number;
  status: ModerationReviewStatus | null;
  created_at: string;
  most_recent: boolean;
}

export type CardId = number;
export type ModerationReviewStatus = "verified";

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

export interface CardQuery {
  ignore_view?: boolean;
}

export interface CardListQuery {
  f?: CardFilterOption;
  model_id?: CardId;
}
