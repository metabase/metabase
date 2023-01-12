import type { DatabaseId } from "./database";
import type { Field } from "./field";
import type {
  DatasetQuery,
  FieldReference,
  AggregationReference,
} from "./query";

export interface Card extends UnsavedCard {
  id: CardId;
  collection_id: number | null;
  name: string;
  description: string | null;
  dataset: boolean;
  database_id?: DatabaseId;
  can_write: boolean;
  cache_ttl: number | null;
  query_average_duration?: number | null;
  last_query_start: string | null;
  result_metadata: Field[];
  archived: boolean;

  creator?: {
    id: number;
    common_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    last_login: string;
    date_joined: string;
  };
}

export interface UnsavedCard {
  display: string;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
}

export type SeriesSettings = {
  title: string;
  color?: string;
  show_series_values?: boolean;
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
  rows: (FieldReference | AggregationReference)[];
  value: string[]; // identifiers for collapsed rows
};

export type VisualizationSettings = {
  "graph.show_values"?: boolean;
  "stackable.stack_type"?: "stacked" | "normalized" | null;

  // X-axis
  "graph.x_axis.title_text"?: string;
  "graph.x_axis.scale"?: "ordinal";
  "graph.x_axis.axis_enabled"?: "compact";

  // Y-axis
  "graph.y_axis.title_text"?: string;
  "graph.y_axis.scale"?: "linear" | "pow" | "log";
  "graph.y_axis.axis_enabled"?: true;

  // Goal
  "graph.goal_value"?: number;
  "graph.show_goal"?: boolean;
  "graph.goal_label"?: string;

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
