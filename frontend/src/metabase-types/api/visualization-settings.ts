import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";

import type { ActionDisplayType } from "./actions";
import type { ClickBehavior } from "./click-behavior";
import type { DatasetColumn, RawSeries, RowValue } from "./dataset";
import type { FieldReference } from "./query";

export type LineSize = "S" | "M" | "L";

export type SeriesSettings = {
  title?: string;
  color?: string;
  show_series_values?: boolean;
  display?: string;
  axis?: string;
  "line.size"?: LineSize;
  "line.style"?: "solid" | "dashed" | "dotted";
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
  value: string | number;
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
  rows: FieldReference[];
  columns: FieldReference[];
  values: FieldReference[];
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
  rows: FieldReference[];
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

export type XAxisScale = "ordinal" | "histogram" | "timeseries" | NumericScale;

export type YAxisScale = NumericScale;

// Map types
export type MapType = "region" | "pin" | "grid";
export type MapPinType = "tiles" | "markers" | "grid";

// Axis display types
export type XAxisEnabled = true | false | "compact" | "rotate-45" | "rotate-90";

// Formatting types
export type ValueFormatting = "auto" | "compact" | "full";
export type LabelValueFrequency = "fit" | "all";

// Pie chart types
export type PiePercentVisibility = "off" | "legend" | "inside" | "both";

// Funnel types
export type FunnelType = "funnel" | "bar";

// Pivot table types
export type PivotTotalsDisplay = "on" | "off" | "both";

// Sankey types
export type SankeyNodeAlign = "left" | "right" | "justify";
export type SankeyEdgeColor = "source" | "target" | "gray";

// Text alignment types
export type VerticalAlign = "top" | "middle" | "bottom";
export type HorizontalAlign = "left" | "center" | "right";

// Action types
export type ButtonVariant =
  | "primary"
  | "default"
  | "danger"
  | "success"
  | "borderless";

// Aggregation functions
export type AggregationFunction =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "stddev"
  | "median";

// Tooltip types
export type TooltipType = "default" | "series_comparison";

// Table cell background getter function type
export type CellBackgroundGetter = (
  value: RowValue,
  rowIndex: number,
  colName: string | undefined,
) => string | null;

// Widget props for pie._dimensions_widget
export interface DimensionsWidgetProps {
  rawSeries: RawSeries;
  settings: VisualizationSettings; // ComputedVisualizationSettings
  onChangeSettings: (newSettings: VisualizationSettings) => void; // ComputedVisualizationSettings
  onShowWidget?: (widget: unknown, ref: unknown) => void;
}

export interface ColumnSettings {
  // Display properties
  column_title?: string;
  text_wrapping?: boolean;
  text_align?: "left" | "center" | "right";
  show_mini_bar?: boolean;
  view_as?: string;
  click_behavior?: ClickBehavior;

  // Number formatting
  number_style?: "decimal" | "percent" | "scientific" | "currency";
  number_separators?: string;
  decimals?: number;
  scale?: number;
  prefix?: string;
  suffix?: string;

  // Currency formatting
  currency?: string;
  currency_style?: "symbol" | "code" | "name";
  currency_in_header?: boolean;

  // Date/Time formatting
  date_style?: string;
  date_separator?: "/" | "-" | ".";
  date_abbreviate?: boolean;
  time_enabled?: "minutes" | "seconds" | "milliseconds" | null;
  time_style?: string;

  // Link formatting
  link_text?: string;
  link_url?: string;

  // Pivot table specific
  "pivot_table.column_sort_order"?: "ascending" | "descending";
  "pivot_table.column_show_totals"?: boolean;

  // Internal/computed properties
  _numberFormatter?: unknown; // NumberFormatter instance - internal formatter object
  _header_unit?: string;
  _column_title_full?: string;
}

// SmartScalar (Trend Chart)
export type SmartScalarComparisonType =
  | "anotherColumn"
  | "previousValue"
  | "previousPeriod"
  | "periodsAgo"
  | "staticNumber";

interface BaseSmartScalarComparison {
  id: string; // client-side generated, used for sorting
  type: SmartScalarComparisonType;
}

export interface SmartScalarComparisonAnotherColumn
  extends BaseSmartScalarComparison {
  type: "anotherColumn";
  column: string;
  label: string;
}

export interface SmartScalarComparisonPeriodsAgo
  extends BaseSmartScalarComparison {
  type: "periodsAgo";
  value: number;
}

export interface SmartScalarComparisonPreviousPeriod
  extends BaseSmartScalarComparison {
  type: "previousPeriod";
}

export interface SmartScalarComparisonPreviousValue
  extends BaseSmartScalarComparison {
  type: "previousValue";
}

export interface SmartScalarComparisonStaticNumber
  extends BaseSmartScalarComparison {
  type: "staticNumber";
  value: number;
  label: string;
}

export type SmartScalarComparison =
  | SmartScalarComparisonAnotherColumn
  | SmartScalarComparisonPreviousValue
  | SmartScalarComparisonPreviousPeriod
  | SmartScalarComparisonPeriodsAgo
  | SmartScalarComparisonStaticNumber;

// Gauge settings
export interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label?: string;
}

// Base visualization settings shared across multiple visualizations
interface BaseVisualizationSettings {
  // Title of a dashboard card
  "card.title"?: string;

  // Description of a dashboard card
  "card.description"?: string;

  // Click behavior on a dashboard card
  click_behavior?: ClickBehavior;

  // Formatting settings for columns
  column_settings?: Record<string, ColumnSettings>;
}

// Scalar Visualization Settings
export interface ScalarVisualizationSettings extends BaseVisualizationSettings {
  // Column to use for the scalar value
  "scalar.field"?: string;
}

// SmartScalar (Trend) Visualization Settings
export interface SmartScalarVisualizationSettings
  extends BaseVisualizationSettings {
  // Column to use for the scalar value
  "scalar.field"?: string;

  // Comparisons configuration
  "scalar.comparisons"?: SmartScalarComparison[];

  // Whether to switch the positive and negative colors
  "scalar.switch_positive_negative"?: boolean;

  // Whether to use a compact format for the primary number
  "scalar.compact_primary_number"?: boolean;
}

// Progress Visualization Settings
export interface ProgressVisualizationSettings
  extends BaseVisualizationSettings {
  // Goal value
  "progress.goal"?: number;

  // Color of the progress bar
  "progress.color"?: string;
}

// Gauge Visualization Settings
export interface GaugeVisualizationSettings extends BaseVisualizationSettings {
  // Segments of the gauge
  "gauge.segments"?: GaugeSegment[];

  // Range of the gauge
  "gauge.range"?: [number, number];
}

// Table Visualization Settings
export interface TableVisualizationSettings extends BaseVisualizationSettings {
  // Whether to enable pagination. Available only in dashboards.
  "table.pagination"?: boolean;

  // Whether to show row index
  "table.row_index"?: boolean;

  // Whether to enable built-in pivot.
  "table.pivot"?: boolean;

  // Column to use for the pivot
  "table.pivot_column"?: string;

  // Column to use for the cell
  "table.cell_column"?: string;

  // Order of columns
  "table.columns"?: TableColumnOrderSetting[];

  // Widths of columns
  "table.column_widths"?: (number | null)[];

  // Conditional formatting settings for columns
  "table.column_formatting"?: ColumnFormattingSetting[];

  // Background getter for cells. Used for conditional formatting.
  "table._cell_background_getter"?: CellBackgroundGetter;
}

// Chart settings shared by Line, Area, Bar, Combo charts
interface CartesianChartSettings extends BaseVisualizationSettings {
  // Stacking
  "stackable.stack_type"?: StackType;

  // Display values
  "graph.show_values"?: boolean;

  // Frequency of labels
  "graph.label_value_frequency"?: LabelValueFrequency;

  // Whether to show stack values
  "graph.show_stack_values"?: StackValuesDisplay;

  // Formatting of values
  "graph.label_value_formatting"?: ValueFormatting;

  // Whether to show a goal
  "graph.show_goal"?: boolean;

  // Value of the goal
  "graph.goal_value"?: number;

  // Label of the goal
  "graph.goal_label"?: string;

  // Whether to show a trendline
  "graph.show_trendline"?: boolean;

  // Title of the x-axis
  "graph.x_axis.title_text"?: string;

  // Scale type of the x-axis
  "graph.x_axis.scale"?: XAxisScale;

  // Whether to show the x-axis
  "graph.x_axis.axis_enabled"?: XAxisEnabled;

  // Whether to show labels on the x-axis
  "graph.x_axis.labels_enabled"?: boolean;

  // Whether x-axis is a timeseries. Derived values, not visible in UI.
  "graph.x_axis._is_timeseries"?: boolean;

  // Whether x-axis is numeric. Derived values, not visible in UI.
  "graph.x_axis._is_numeric"?: boolean;

  // Whether x-axis is a histogram. Derived values, not visible in UI.
  "graph.x_axis._is_histogram"?: boolean;

  // Title of the y-axis
  "graph.y_axis.title_text"?: string;

  // Scale type of the y-axis
  "graph.y_axis.scale"?: YAxisScale;

  // Whether to show the y-axis
  "graph.y_axis.axis_enabled"?: boolean;

  // Whether to show labels on the y-axis
  "graph.y_axis.labels_enabled"?: boolean;

  // Minimum value of the y-axis
  "graph.y_axis.min"?: number;

  // Maximum value of the y-axis
  "graph.y_axis.max"?: number;

  // Whether to unpin the y-axis from zero
  "graph.y_axis.unpin_from_zero"?: boolean;

  // Whether to automatically set the range of the y-axis
  "graph.y_axis.auto_range"?: boolean;

  // Whether to automatically split the y-axis into multiple axes
  "graph.y_axis.auto_split"?: boolean;

  // Preferred number of splits for the y-axis
  "graph.y_axis.split_number"?: number;

  // Dimensions are columns used to group data. The first dimension always becomes the x-axis. The second dimension creates breakout series.
  "graph.dimensions"?: [] | [string] | [string, string];

  // Metrics are columns containing the values to be plotted (e.g., counts, sums, averages)
  "graph.metrics"?: string[];

  // Order of series. This setting is used only for charts with breakout series — ones with two values in 'graph.dimensions'.
  "graph.series_order"?: SeriesOrderSetting[];

  // Breakout dimension used for series order. This setting is used only for charts with breakout series — ones with two values in 'graph.dimensions'.
  "graph.series_order_dimension"?: string;

  // Legacy setting that contains labels for series.
  "graph.series_labels"?: string[];

  // Settings for each series
  series_settings?: Record<string, SeriesSettings>;

  // Series color by series name
  "series_settings.colors"?: Record<string, string>;

  // [Disabled feature]
  "graph.max_categories_enabled"?: boolean;
  "graph.max_categories"?: number;
  "graph.other_category_color"?: string;
  "graph.other_category_aggregation_fn"?: AggregationFunction;

  // Tooltip
  "graph.tooltip_type"?: TooltipType;

  // Additional columns to show in the tooltip
  "graph.tooltip_columns"?: string[];

  // Whether to reverse the legend
  "legend.is_reversed"?: boolean;

  // Deprecated settings
  "line.interpolate"?: string;
  "line.marker_enabled"?: boolean;
  "line.missing"?: string;
  "graph.colors"?: Record<string, string>;
}

// LineChart Visualization Settings
export interface LineChartVisualizationSettings
  extends CartesianChartSettings {}

// AreaChart Visualization Settings
export interface AreaChartVisualizationSettings
  extends CartesianChartSettings {}

// BarChart Visualization Settings
export interface BarChartVisualizationSettings extends CartesianChartSettings {}

// ComboChart Visualization Settings
export interface ComboChartVisualizationSettings
  extends CartesianChartSettings {}

// WaterfallChart Visualization Settings
export interface WaterfallChartVisualizationSettings
  extends BaseVisualizationSettings,
    Pick<
      CartesianChartSettings,
      | "graph.x_axis.title_text"
      | "graph.x_axis.scale"
      | "graph.x_axis.axis_enabled"
      | "graph.x_axis.labels_enabled"
      | "graph.y_axis.title_text"
      | "graph.y_axis.scale"
      | "graph.y_axis.axis_enabled"
      | "graph.y_axis.labels_enabled"
      | "graph.y_axis.min"
      | "graph.y_axis.max"
      | "graph.y_axis.unpin_from_zero"
      | "graph.y_axis.auto_range"
      | "graph.show_values"
      | "graph.label_value_frequency"
      | "graph.label_value_formatting"
      | "graph.dimensions"
      | "graph.metrics"
      | "graph.series_order"
      | "graph.tooltip_type"
      | "graph.tooltip_columns"
    > {
  // Color of positive values
  "waterfall.increase_color"?: string;

  // Color of negative values
  "waterfall.decrease_color"?: string;

  // Color of the total
  "waterfall.total_color"?: string;

  // Whether to show the total
  "waterfall.show_total"?: boolean;
}

// NOTE: for row charts, axes are swapped to use the same settings as line/area/bar charts
export interface RowChartVisualizationSettings
  extends BaseVisualizationSettings,
    Pick<
      CartesianChartSettings,
      | "graph.x_axis.title_text"
      | "graph.x_axis.scale" // NOTE: for row charts, y-axis scale is always ordinal
      | "graph.x_axis.axis_enabled"
      | "graph.x_axis.labels_enabled"
      | "graph.y_axis.title_text"
      | "graph.y_axis.scale"
      | "graph.y_axis.axis_enabled"
      | "graph.y_axis.labels_enabled"
      | "graph.y_axis.min"
      | "graph.y_axis.max"
      | "graph.y_axis.auto_range"
      | "graph.show_values"
      | "graph.label_value_frequency"
      | "graph.label_value_formatting"
      | "graph.dimensions"
      | "graph.metrics"
      | "graph.series_order"
      | "graph.tooltip_type"
      | "graph.tooltip_columns"
      | "stackable.stack_type"
    > {}

export interface ScatterPlotVisualizationSettings
  extends CartesianChartSettings {
  // Column to use for the bubble size
  "scatter.bubble"?: string;
}

export interface PieChartVisualizationSettings
  extends BaseVisualizationSettings {
  // Dimensions to use for the pie chart
  "pie.dimension"?:
    | string
    | [string]
    | [string, string]
    | [string, string, string];

  // Middle dimension to use for the pie chart
  "pie.middle_dimension"?: string;

  // Outer dimension to use for the pie chart
  "pie.outer_dimension"?: string;

  // Metric to use for the pie chart
  "pie.metric"?: string;

  // Rows to use for the pie chart
  "pie.rows"?: PieRow[];

  // Whether to sort the rows
  "pie.sort_rows"?: boolean;

  // Dimension to use for sorting the rows
  "pie.sort_rows_dimension"?:
    | string
    | [string]
    | [string, string]
    | [string, string, string];

  // Whether to show the legend
  "pie.show_legend"?: boolean;

  // Whether to show the total
  "pie.show_total"?: boolean;

  // Whether to show the labels
  "pie.show_labels"?: boolean;

  // Whether to show the percentages
  "pie.percent_visibility"?: PiePercentVisibility;

  // Number of decimal places to show
  "pie.decimal_places"?: number;

  // Threshold to show the slice
  "pie.slice_threshold"?: number;

  // Colors to use for the pie chart
  "pie.colors"?: Record<string, string>;

  // Dimensions widget
  "pie._dimensions_widget"?: DimensionsWidgetProps;
}

export interface MapVisualizationSettings extends BaseVisualizationSettings {
  // Type of the map
  "map.type"?: MapType;

  // Type of the pin/grid map
  "map.pin_type"?: MapPinType;

  // Latitude column
  "map.latitude_column"?: string;

  // Longitude column
  "map.longitude_column"?: string;

  // Metric column
  "map.metric_column"?: string;

  // Region column
  "map.region"?: string;

  // Metric column
  "map.metric"?: string;

  // Dimension column
  "map.dimension"?: string;

  // Colors to use for the map
  "map.colors"?: string[];

  // Zoom level
  "map.zoom"?: number;

  // Center latitude
  "map.center_latitude"?: number;

  // Center longitude
  "map.center_longitude"?: number;

  // Radius of the heat map
  "map.heat.radius"?: number;

  // Blur of the heat map
  "map.heat.blur"?: number;

  // Minimum opacity of the heat map
  "map.heat.min-opacity"?: number;

  // Maximum zoom level of the heat map
  "map.heat.max-zoom"?: number;
}

export type FunnelRow = {
  key: string;
  name: string;
  enabled: boolean;
};

export interface FunnelVisualizationSettings extends BaseVisualizationSettings {
  // Dimension to use for the funnel chart
  "funnel.dimension"?: string;

  // Metric to use for the funnel chart
  "funnel.metric"?: string;

  // Type of the funnel chart
  "funnel.type"?: FunnelType;

  // Ordered rows to use for the funnel chart
  "funnel.rows"?: FunnelRow[];

  // Dimension to use for ordering the rows
  "funnel.order_dimension"?: string;
}

// ObjectDetail Visualization Settings
export interface ObjectDetailVisualizationSettings
  extends BaseVisualizationSettings,
    Pick<TableVisualizationSettings, "table.columns"> {}

// PivotTable Visualization Settings
export interface PivotTableVisualizationSettings
  extends BaseVisualizationSettings,
    Pick<TableVisualizationSettings, "table.column_formatting"> {
  // Pivot column split setting
  "pivot_table.column_split"?: PivotTableColumnSplitSetting;

  // Collapsed rows
  "pivot_table.collapsed_rows"?: PivotTableCollapsedRowsSetting;

  // Column widths
  "pivot_table.column_widths"?: Record<string, number>;

  // Whether to show row totals
  "pivot.show_row_totals"?: PivotTotalsDisplay;

  // Whether to show column totals
  "pivot.show_column_totals"?: PivotTotalsDisplay;

  // Whether to condense duplicate totals
  "pivot.condense_duplicate_totals"?: boolean;

  // Column split setting — Legacy setting, not used for new questions
  "pivot.column_split"?: PivotTableColumnSplitSetting;
}

export interface SankeyChartVisualizationSettings
  extends BaseVisualizationSettings {
  // Source column
  "sankey.source"?: string;

  // Target column
  "sankey.target"?: string;

  // Value column
  "sankey.value"?: string;

  // Alignment of the nodes
  "sankey.node_align"?: SankeyNodeAlign;

  // Whether to show the edge labels
  "sankey.show_edge_labels"?: boolean;

  // Formatting of the edge labels
  "sankey.label_value_formatting"?: ValueFormatting;

  // Color of the edges
  "sankey.edge_color"?: SankeyEdgeColor;
}

export interface TextVisualizationSettings extends BaseVisualizationSettings {
  // Text to display
  text?: string;

  // Vertical alignment of the text
  "text.align_vertical"?: VerticalAlign;

  // Horizontal alignment of the text
  "text.align_horizontal"?: HorizontalAlign;

  // Whether to show a background in the dashboard card
  "dashcard.background"?: boolean;
}

export interface HeadingVisualizationSettings
  extends BaseVisualizationSettings {
  // Text to display
  text?: string;

  // Whether to show a background in the dashboard card
  "dashcard.background"?: boolean;
}

export interface LinkVisualizationSettings extends BaseVisualizationSettings {
  // URL to link to
  link?: {
    url?: string;
  };
}

export interface IFrameVisualizationSettings extends BaseVisualizationSettings {
  // URL to embed
  iframe?: string;
}

export interface ActionVisualizationSettings extends BaseVisualizationSettings {
  // Type of the action
  actionDisplayType?: ActionDisplayType;

  // Label of the button
  "button.label"?: string;

  // Variant of the button
  "button.variant"?: ButtonVariant;
}

type $FixMeVisiaulizationSettingsCatchAll = {
  [key: string]: any;
};

// Union type of all visualization settings
export type VisualizationSettings = ScalarVisualizationSettings &
  SmartScalarVisualizationSettings &
  ProgressVisualizationSettings &
  GaugeVisualizationSettings &
  TableVisualizationSettings &
  LineChartVisualizationSettings &
  AreaChartVisualizationSettings &
  BarChartVisualizationSettings &
  ComboChartVisualizationSettings &
  WaterfallChartVisualizationSettings &
  RowChartVisualizationSettings &
  ScatterPlotVisualizationSettings &
  PieChartVisualizationSettings &
  MapVisualizationSettings &
  FunnelVisualizationSettings &
  ObjectDetailVisualizationSettings &
  PivotTableVisualizationSettings &
  SankeyChartVisualizationSettings &
  TextVisualizationSettings &
  HeadingVisualizationSettings &
  LinkVisualizationSettings &
  IFrameVisualizationSettings &
  ActionVisualizationSettings &
  BaseVisualizationSettings &
  $FixMeVisiaulizationSettingsCatchAll;

export type VisualizationSettingKey = keyof VisualizationSettings;
