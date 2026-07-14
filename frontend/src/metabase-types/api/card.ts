import type { CurrencyStyle } from "metabase/utils/formatting";
import type { TimeOnlyOptions } from "metabase/utils/formatting/types";
import type { IconName } from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

import type { ClickBehavior } from "./click-behavior";
import type { Collection, CollectionId, LastEditInfo } from "./collection";
import type {
  DashCardId,
  Dashboard,
  DashboardCardSize,
  DashboardId,
  DashboardTabId,
} from "./dashboard";
import type { Database, DatabaseId } from "./database";
import type { RowValue } from "./dataset";
import type { Document, DocumentId } from "./document";
import type { EmbeddingParameters, EmbeddingType } from "./embed";
import type { BaseEntityId } from "./entity-id";
import type { Field } from "./field";
import type { ModerationReview } from "./moderation";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type {
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "./parameters";
import type { DownloadPermission } from "./permissions";
import type { DatasetQuery, FieldReference, PublicDatasetQuery } from "./query";
import type { CollectionEssentials } from "./search";
import type { Table, TableId } from "./table";
import type { UserInfo } from "./user";
import type { CardDisplayType, VisualizationDisplay } from "./visualization";
import type {
  PieRow,
  SmartScalarComparison,
  TreemapRow,
} from "./visualization-settings";

export const CARD_TYPES = ["model", "question", "metric"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type CardCreationType =
  | "simple_question"
  | "custom_question"
  | "native_question";

export type CardDashboardInfo = Pick<Dashboard, "id" | "name">;
export type CardDocumentInfo = Pick<Document, "id" | "name">;

export interface Card<
  Q extends DatasetQuery = DatasetQuery,
> extends UnsavedCard<Q> {
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
  embedding_type?: EmbeddingType | null;
  embedding_params: EmbeddingParameters | null;
  can_write: boolean;
  can_restore: boolean;
  can_delete: boolean;
  can_manage_db: boolean;
  initially_published_at: string | null;

  database_id?: DatabaseId;
  collection?: Collection | null;
  collection_id: CollectionId | null;
  collection_position: number | null;
  dashboard: CardDashboardInfo | null;
  dashboard_id: DashboardId | null;
  document_id?: DocumentId | null;
  document?: CardDocumentInfo | null;
  dashboard_count: number | null;
  parameter_usage_count?: number | null;

  result_metadata: Field[] | null;
  param_fields?: Record<ParameterId, Field[]>;
  moderation_reviews?: ModerationReview[];
  persisted?: boolean;

  query_average_duration?: number | null;
  last_query_start: string | null;
  average_query_time: number | null;
  cache_ttl: number | null;
  based_on_upload?: TableId | null; // table id of upload table, if any

  archived: boolean;
  is_remote_synced?: boolean;

  creator?: UserInfo;
  "last-edit-info"?: LastEditInfo;
  table_id?: TableId;
  view_count?: number;

  download_perms?: DownloadPermission;
  displayIsLocked?: boolean;
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
  displayIsLocked?: boolean;

  // Not part of the card API contract, a transient marker for how the card was created
  creationType?: CardCreationType;
}

export type LineSize = "S" | "M" | "L";

export type SeriesSettings = {
  title?: string;
  color?: string;
  show_series_values?: boolean;
  display?: VisualizationDisplay;
  axis?: string;
  "line.size"?: LineSize;
  "line.style"?: "solid" | "dashed" | "dotted";
  "line.interpolate"?: string;
  "line.marker_enabled"?: boolean;
  "line.missing"?: string;
  show_series_trendline?: boolean;
};

export type SeriesOrderSetting = {
  name: string;
  key: string;
  enabled: boolean;
  color?: string;
};

export type ConditionalFormattingCommonOperator = "is-null" | "not-null";
export type ConditionalFormattingComparisonOperator =
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">=";
export type ConditionalFormattingStringOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with";
export type ConditionalFormattingBooleanOperator = "is-true" | "is-false";

export type ColumnFormattingOperator =
  | ConditionalFormattingCommonOperator
  | ConditionalFormattingComparisonOperator
  | ConditionalFormattingStringOperator
  | ConditionalFormattingBooleanOperator;

export type ColumnSingleFormattingSetting = {
  columns: string[];
  type: "single";
  operator: ColumnFormattingOperator;
  color: string;
  highlight_row: boolean;
  value: RowValue;
};
export type ColumnRangeFormattingSetting = {
  columns: string[];
  type: "range";
  colors: string[];
  min_type: "custom" | "all" | null;
  max_type: "custom" | "all" | null;
  min_value?: number;
  max_value?: number;
};

export type ColumnFormattingSetting =
  | ColumnSingleFormattingSetting
  | ColumnRangeFormattingSetting;

export type ColumnNameColumnSplitSetting = {
  rows: string[];
  columns: string[];
  values: string[];
};

export type FieldRefColumnSplitSetting = {
  rows: (FieldReference | null)[];
  columns: (FieldReference | null)[];
  values: (FieldReference | null)[];
};

// Field ref-based visualization settings are considered legacy and are not used
// for new questions. To not break existing questions we need to support both
// old- and new-style settings until they are fully migrated.
export type PivotTableColumnSplitSetting =
  | ColumnNameColumnSplitSetting
  | FieldRefColumnSplitSetting;

export type ColumnNameCollapsedRowsSetting = {
  rows: string[];
  value: string[]; // identifiers for collapsed rows
};

export type FieldRefCollapsedRowsSetting = {
  rows: (FieldReference | null)[];
  value: string[];
};

export type PivotTableCollapsedRowsSetting =
  | ColumnNameCollapsedRowsSetting
  | FieldRefCollapsedRowsSetting;

export type TableColumnOrderSetting = {
  name: string;
  enabled: boolean;
};

export type StackType = "stacked" | "normalized" | null;
export type StackValuesDisplay = "total" | "all" | "series";

export const numericScale = ["linear", "pow", "log"] as const;
export type NumericScale = (typeof numericScale)[number];

export type BoxPlotWhiskerType = "tukey" | "min-max";
export type BoxPlotPointsMode = "none" | "outliers" | "all";
export type BoxPlotShowValuesMode = "median" | "all";

export type XAxisScale = "ordinal" | "histogram" | "timeseries" | NumericScale;

export type YAxisScale = NumericScale;

export type ColumnSettings = TimeOnlyOptions & {
  _column_title_full?: string;
  "pivot_table.column_show_totals"?: boolean;
  text_align?: "left" | "middle" | "right";
  click_behavior?: ClickBehavior;
  clicked?: any;
  collapseNewlines?: boolean;
  column?: any;
  column_title?: string;
  compact?: boolean;
  currency?: string;
  currency_style?: CurrencyStyle;
  date_abbreviate?: boolean;
  date_format?: string;
  date_separator?: string;
  date_style?: string | null;
  decimals?: number;
  isExclude?: boolean;
  jsx?: boolean;
  link_text?: string;
  link_url?: string;
  majorWidth?: number;
  markdown_template?: any;
  maximumFractionDigits?: number;
  negativeInParentheses?: boolean;
  noRange?: boolean;
  number_separators?: string;
  number_style?: string;
  prefix?: string;
  remap?: any;
  removeDay?: boolean;
  removeYear?: boolean;
  rich?: boolean;
  scale?: number;
  show_mini_bar?: boolean;
  stringifyNull?: boolean;
  suffix?: string;
  type?: string;
  view_as?: string | null;
  weekday_enabled?: boolean;
  [key: string]: any;
};

/**
 * Visualization-specific display options. Prefer Metabase defaults unless the
 * user asks for an explicit presentation change; many settings depend on exact
 * result column names.
 */
export type VisualizationSettings = {
  /** Show value labels directly on supported chart marks. */
  "graph.show_values"?: boolean;

  /** Stack compatible series as `stacked` or `normalized`; `null` disables stacking. */
  "stackable.stack_type"?: StackType;

  /** Show aggregate labels for stacked chart segments. */
  "graph.show_stack_values"?: StackValuesDisplay;

  /** Limit the number of categories before grouping the rest into an "Other" bucket. */
  "graph.max_categories_enabled"?: boolean;

  /** Maximum number of categories to show before using the "Other" bucket. */
  "graph.max_categories"?: number;

  /** Aggregation used for values that are grouped into the "Other" bucket. */
  "graph.other_category_aggregation_fn"?:
    | "sum"
    | "avg"
    | "min"
    | "max"
    | "stddev"
    | "median";

  /** Visible table columns and order, as `{ name, enabled }` entries. */
  "table.columns"?: TableColumnOrderSetting[];

  /**
   * Per-column titles, number or currency formatting, and click behavior.
   * Keys can be modern (`getColumnKey`) or legacy (`getLegacyColumnKey`).
   */
  column_settings?: Record<string, ColumnSettings>;

  /** Override the x-axis label. */
  "graph.x_axis.title_text"?: string;

  /** X-axis scale, such as ordinal, timeseries, histogram, linear, pow, or log. */
  "graph.x_axis.scale"?: XAxisScale;

  /** Hide, compact, or rotate x-axis labels where the visualization supports it. */
  "graph.x_axis.axis_enabled"?:
    | true
    | false
    | "compact"
    | "rotate-45"
    | "rotate-90";

  /** Let Metabase choose the y-axis bounds automatically. */
  "graph.y_axis.auto_range"?: boolean;

  /** Override the y-axis label. */
  "graph.y_axis.title_text"?: string;

  /** Y-axis numeric scale, such as linear, pow, or log. */
  "graph.y_axis.scale"?: YAxisScale;

  /** Show or hide the y-axis where the visualization supports it. */
  "graph.y_axis.axis_enabled"?: boolean;

  /** Fixed y-axis minimum when auto range is disabled. */
  "graph.y_axis.min"?: number;

  /** Fixed y-axis maximum when auto range is disabled. */
  "graph.y_axis.max"?: number;

  /** Numeric value for the goal line. */
  "graph.goal_value"?: number;

  /** Draw a goal line on supported cartesian charts. */
  "graph.show_goal"?: boolean;

  /** Label for the goal line. */
  "graph.goal_label"?: string;

  /** Add a trend line, best for time-based trends without extra groupings. */
  "graph.show_trendline"?: boolean;

  /** Render compatible series in separate panels instead of one chart. */
  "graph.split_panels"?: boolean;

  /**
   * Result column names used for the x-axis, category, or grouping dimension.
   * Prefer Metabase defaults unless the query needs a specific split.
   */
  "graph.dimensions"?: string[];

  /**
   * Result metric column names to plot. Useful when the query returns multiple
   * numeric columns and Metabase should not infer the metrics.
   */
  "graph.metrics"?: string[];

  /** Per-series labels, colors, and display tweaks. Keys are data-dependent. */
  series_settings?: Record<string, SeriesSettings | undefined>;

  /** Explicit order, labels, colors, and enabled state for breakout series. */
  "graph.series_order"?: SeriesOrderSetting[];

  /** Result numeric column name used to size scatter plot bubbles. */
  "scatter.bubble"?: string;

  /** Color used for increasing waterfall bars. */
  "waterfall.increase_color"?: string;

  /** Color used for decreasing waterfall bars. */
  "waterfall.decrease_color"?: string;

  /** Color used for the total waterfall bar. */
  "waterfall.total_color"?: string;

  /** Add a final total bar to a waterfall chart. */
  "waterfall.show_total"?: boolean;

  /** Explicit order, labels, colors, and enabled state for funnel steps. */
  "funnel.rows"?: SeriesOrderSetting[];

  /** Conditional formatting rules for table cells. */
  "table.column_formatting"?: ColumnFormattingSetting[];

  /** Pivot column selection. */
  "pivot_table.column_split"?: PivotTableColumnSplitSetting;

  /** Initially collapsed pivot rows. */
  "pivot_table.collapsed_rows"?: PivotTableCollapsedRowsSetting;

  /** Smart-scalar comparison configuration. */
  "scalar.comparisons"?: SmartScalarComparison[];

  /** Result column name to display as the main scalar value. */
  "scalar.field"?: string;

  /** Reverse good/bad direction for scalar comparisons. */
  "scalar.switch_positive_negative"?: boolean;

  /** Use compact formatting for the primary scalar number. */
  "scalar.compact_primary_number"?: boolean;

  /** Segment configuration for scalar visualizations. */
  "scalar.segments"?: ScalarSegment[];

  /** Result column name, or names, used as pie slice dimensions. */
  "pie.dimension"?: string | string[];

  /** Result column name used as the middle ring dimension. */
  "pie.middle_dimension"?: string;

  /** Result column name used as the outer ring dimension. */
  "pie.outer_dimension"?: string;

  /** Explicit pie slice order, labels, colors, and enabled state. */
  "pie.rows"?: PieRow[];

  /** Result numeric column name used as the pie slice value. */
  "pie.metric"?: string;

  /** Sort pie slices by metric value. */
  "pie.sort_rows"?: boolean;

  /** Show the pie legend. */
  "pie.show_legend"?: boolean;

  /** Show the total value in the center of the pie. */
  "pie.show_total"?: boolean;

  /** Show labels on pie slices. */
  "pie.show_labels"?: boolean;

  /** Place percentages in the legend, inside slices, both, or neither. */
  "pie.percent_visibility"?: "off" | "legend" | "inside" | "both";

  /** Percentage decimal precision for pie labels. */
  "pie.decimal_places"?: number;

  /** Group small slices below this threshold into "Other". */
  "pie.slice_threshold"?: number;

  /** Legacy slice color map. Prefer defaults unless exact colors matter. */
  "pie.colors"?: Record<string, string>;

  /** Result column name for the source node. */
  "sankey.source"?: string;

  /** Result column name for the target node. */
  "sankey.target"?: string;

  /** Result numeric column name for the flow value. */
  "sankey.value"?: string;

  /** Sankey node alignment. */
  "sankey.node_align"?: "left" | "right" | "justify";

  /** Show labels on Sankey flow edges. */
  "sankey.show_edge_labels"?: boolean;

  /** Formatting for Sankey edge labels. */
  "sankey.label_value_formatting"?: "auto" | "full" | "compact";

  /** Treemap settings */
  "treemap.grouping"?: string;
  "treemap.sub_grouping"?: string | null;
  "treemap.value"?: string;
  "treemap.rows"?: TreemapRow[];
  "treemap.show_parent_labels"?: boolean;
  "treemap.show_parent_values"?: boolean;
  "treemap.show_leaf_labels"?: boolean;
  "treemap.show_leaf_values"?: boolean;

  /** Box plot whisker calculation, such as Tukey or min/max. */
  "boxplot.whisker_type"?: BoxPlotWhiskerType;

  /** Show no points, outliers only, or all points. */
  "boxplot.points_mode"?: BoxPlotPointsMode;

  /** Show the mean marker. */
  "boxplot.show_mean"?: boolean;

  /** Show median values, all values, or no value labels. */
  "boxplot.show_values_mode"?: BoxPlotShowValuesMode;

  /** Columns selected for custom list view. */
  "list.columns"?: ListViewColumns;

  /** Show or hide the first list item column that renders an image or icon. */
  "list.entity_icon_enabled"?: boolean;

  /** Render an image from an image/avatar URL column instead of the default icon. */
  "list.use_image_column"?: boolean;

  /** Icon used for list entities when an image column is not used. */
  "list.entity_icon"?: IconName | null;

  /** Color used for the list entity icon. */
  "list.entity_icon_color"?: string;

  [key: string]: any;
} & EmbedVisualizationSettings;

export type EmbedVisualizationSettings = {
  iframe?: string;
};

export type VisualizationSettingKey = Exclude<
  keyof VisualizationSettings,
  number // TS infers number because of `[key: string]: any` in VisualizationSettings
>;

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
  id: CardId | EntityToken;
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
  description?: string | null;
  collection_id?: CollectionId | null;
  dashboard_id?: DashboardId | null;
  document_id?: DocumentId | null;
  dashboard_tab_id?: DashboardTabId;
  collection_position?: number | null;
  result_metadata?: Field[] | null;
  cache_ttl?: number | null;
  size?: DashboardCardSize;
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
  description?: string | null;
  visualization_settings?: VisualizationSettings;
  archived?: boolean;
  enable_embedding?: boolean;
  embedding_type?: EmbeddingType | null;
  embedding_params?: EmbeddingParameters;
  collection_id?: CollectionId | null;
  dashboard_id?: DashboardId | null;
  document_id?: DocumentId | null;
  collection_position?: number | null;
  result_metadata?: Field[] | null;
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
  cardId?: CardId | EntityToken;
  entityIdentifier?: EntityUuid | EntityToken | null;
  paramId: ParameterId;
  value: ParameterValueOrArray;
};

export type ListViewColumns = {
  left: string[];
  right: string[];
  image?: string;
};

export type ScalarSegment = {
  min: number | null;
  max: number | null;
  color: string;
  label?: string;
};
