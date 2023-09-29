import type { GaugeSegment } from "metabase/static-viz/components/Gauge/types";
import type {
  HeaderWidthType,
  PivotSetting,
} from "metabase/visualizations/visualizations/PivotTable/types";
import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";
import type { OptionsType } from "metabase/lib/formatting/types";
import type { DatasetColumn } from "metabase-types/api/dataset";
import type { ClickBehavior } from "metabase-types/api/click-behavior";
import type { ActionDisplayType } from "metabase-types/api/actions";
import type { DateFormatOptions } from "metabase/static-viz/lib/dates";
import type { DatabaseId } from "./database";
import type {
  DashboardId,
  DashCardId,
  LinkCardSettings,
  VirtualCard,
} from "./dashboard";
import type { Field } from "./field";
import type { Parameter } from "./parameters";
import type { DatasetQuery, FieldReference, PublicDatasetQuery } from "./query";
import type { UserInfo } from "./user";

export interface Card<Q = DatasetQuery> extends UnsavedCard<Q> {
  id: CardId;
  name: string;
  description: string | null;
  dataset: boolean;
  public_uuid: string | null;
  can_write: boolean;

  database_id?: DatabaseId;
  collection_id: number | null;

  result_metadata: Field[];
  moderation_reviews?: ModerationReview[];

  query_average_duration?: number | null;
  last_query_start: string | null;
  average_query_time: number | null;
  cache_ttl: number | null;

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

export interface UnsavedCard<Q = DatasetQuery> {
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
  rows: FieldReference[];
  value: string[]; // identifiers for collapsed rows
};

export type TableColumnOrderSetting = {
  name: string;
  enabled: boolean;

  // We have some corrupted visualization settings where both names are mixed
  // We should settle on `fieldRef`, make it required and remove `field_ref`
  fieldRef?: FieldReference;
  field_ref?: FieldReference;
};

export type ButtonVariant =
  | "primary"
  | "default"
  | "danger"
  | "success"
  | "borderless";

export type BasicVisualizationSettings = {
  "button.label"?: string;
  "button.variant"?: ButtonVariant;
  "card.description"?: string;
  "card.hide_empty"?: boolean;
  "card.title"?: string;
  "dashcard.background"?: boolean;
  "detail.showHeader"?: boolean;
  "funnel.dimension"?: string | null;
  "funnel.metric"?: string | null;
  "funnel.order_dimension"?: string;
  "funnel.rows"?: SeriesOrderSetting[];
  "funnel.type"?: "funnel" | "bar";
  "gauge.range"?: [number, number];
  "gauge.segments"?: GaugeSegment[];
  "graph._dimension_filter"?: (col: unknown) => boolean;
  "graph._metric_filter"?: (col: unknown) => boolean;
  "graph.colors"?: string[];
  "graph.dimensions"?: string[];
  "graph.goal_label"?: string;
  "graph.goal_value"?: number;
  "graph.label_value_formatting"?: "auto" | "compact" | "full";
  "graph.label_value_frequency"?: "fit" | "all";
  "graph.metrics"?: string[];
  "graph.series_labels"?: string[];
  "graph.series_order"?: SeriesOrderSetting[];
  "graph.series_order_dimension"?: string;
  "graph.show_goal"?: boolean;
  "graph.show_trendline"?: boolean;
  "graph.show_values"?: boolean;
  "graph.x_axis._is_histogram"?: boolean;
  "graph.x_axis.axis_enabled"?: boolean | "compact" | "rotate-45" | "rotate-90";
  "graph.x_axis.gridLine_enabled"?: boolean;
  "graph.x_axis.labels_enabled"?: boolean;
  "graph.x_axis.scale"?:
    | "timeseries"
    | "linear"
    | "pow"
    | "log"
    | "histogram"
    | "ordinal";
  "graph.x_axis._scale_original"?: VisualizationSettings["graph.x_axis.scale"];
  "graph.x_axis.title_text"?: string;
  "graph.y_axis.auto_range"?: boolean;
  "graph.y_axis.auto_split"?: boolean;
  "graph.y_axis.axis_enabled"?: boolean;
  "graph.y_axis.labels_enabled"?: boolean;
  "graph.y_axis.max"?: number;
  "graph.y_axis.min"?: number;
  "graph.y_axis.scale"?: "linear" | "pow" | "log";
  "graph.y_axis.title_text"?: string;
  "line.interpolate"?: "linear" | "cardinal" | "step-after";
  "line.marker_enabled"?: null | boolean;
  "line.missing"?: "zero" | "none" | "interpolate";
  "map.center_latitude"?: number;
  "map.center_longitude"?: number;
  "map.colors"?: string[];
  "map.dimension"?: string;
  "map.heat.blur"?: number;
  "map.heat.max-zoom"?: number;
  "map.heat.min-opacity"?: number;
  "map.heat.radius"?: number;
  "map.latitude_column"?: string;
  "map.longitude_column"?: string;
  "map.metric"?: string;
  "map.metric_column"?: string;
  "map.pin_type"?: "tiles" | "markers" | "heat" | "grid";
  "map.region"?: "us_states" | "world_countries" | string;
  "map.type"?: "region" | "pin" | "heat" | "grid";
  "map.zoom"?: number;
  "pie._colors"?: string[];
  "pie._dimensionIndex"?: number;
  "pie._dimensionTitles"?: string[] | null;
  "pie._dimensionValues"?: string[] | null;
  "pie._metricIndex"?: number;
  "pie.colors"?: string[];
  "pie.dimension"?: string;
  "pie.metric"?: string;
  "pie.percent_visibility"?: "off" | "legend" | "inside";
  "pie.show_legend"?: boolean;
  "pie.show_total"?: boolean;
  "pie.slice_threshold"?: number;
  "pivot.show_column_totals"?: boolean;
  "pivot.show_row_totals"?: boolean;
  "pivot_table.collapsed_rows"?: PivotTableCollapsedRowsSetting;
  "pivot_table.column_show_totals"?: boolean;
  "pivot_table.column_split"?: PivotSetting;
  "pivot_table.column_widths"?: HeaderWidthType;
  "progress.color"?: string;
  "progress.goal"?: number;
  "scalar.field"?: string;
  "scalar.switch_positive_negative"?: boolean;
  "scalar.decimals"?: number; // legacy
  "scalar.locale"?: null | string; // legacy
  "scalar.prefix"?: string; // legacy
  "scalar.scale"?: number; // legacy
  "scalar.suffix"?: string; // legacy
  "scatter.bubble"?: string;
  series_settings?: Record<string, SeriesSettings>;
  "series_settings.colors"?: { [key: string]: string };
  "stackable.stack_display"?: "area" | "bar";
  "stackable.stack_type"?: "stacked" | "normalized" | null;
  "stackable.stacked"?: VisualizationSettings["stackable.stack_type"]; // legacy
  "table._cell_background_getter"?: (
    value: unknown,
    rowIndex: number,
    colName: string,
  ) => string;
  "table.cell_column"?: string;
  "table.column_formatting"?: ColumnFormattingSetting[];
  "table.column_widths"?: number[];
  "table.columns"?: TableColumnOrderSetting[];
  "table.pivot"?: boolean;
  "table.pivot_column"?: string;
  "text.align_horizontal"?: "left" | "center" | "right";
  "text.align_vertical"?: "top" | "middle" | "bottom";
  "waterfall.decrease_color"?: string;
  "waterfall.increase_color"?: string;
  "waterfall.show_total"?: boolean;
  "waterfall.total_color"?: string;

  title?: string;
  text?: string;
  display?: "line" | "area" | "bar";
  axis?: null | "left" | "right";
  _header_unit?: string;
  column_title?: string;
  _column_title_full?: string;
  currency_in_header?: boolean;
  show_mini_bar?: boolean;
  _numberFormatter?: any;

  click_behavior?: ClickBehavior;
  actionDisplayType?: ActionDisplayType;

  virtual_card?: VirtualCard;
  link?: LinkCardSettings;

  number_style?: NumberFormatOptions["number_style"];
  number_separators?: NumberFormatOptions["number_separators"];
  currency?: NumberFormatOptions["currency"];
  currency_style?: NumberFormatOptions["currency_style"];
  decimals?: NumberFormatOptions["decimals"];
  scale?: NumberFormatOptions["scale"];
  prefix?: NumberFormatOptions["prefix"];
  suffix?: NumberFormatOptions["suffix"];

  date_style?: DateFormatOptions["date_style"];
  date_abbreviate?: DateFormatOptions["date_abbreviate"];
  date_separator?: DateFormatOptions["date_separator"];
  time_style?: DateFormatOptions["time_style"];
  time_enabled?: OptionsType["time_enabled"];
};

export type VisualizationColumnSettings = {
  column: (column: DatasetColumn) => BasicVisualizationSettings;
  column_settings: {
    [columnKey in string]: BasicVisualizationSettings;
  };
};

export type VisualizationSettings = BasicVisualizationSettings &
  Partial<VisualizationColumnSettings>;

export type VisualizationSettingId = keyof VisualizationSettings;

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
