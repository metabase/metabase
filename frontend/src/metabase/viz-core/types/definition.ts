import type { CSSProperties, ComponentType } from "react";

import type {
  ColumnSettings,
  DashboardId,
  DatasetColumn,
  DatasetData,
  Field,
  IconName,
  RawSeries,
  Series,
  SingleSeries,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizationDisplay } from "metabase-types/api/visualization";

import type { ComputedVisualizationSettings } from "./computed-settings";
import type {
  ChartSettingColorRangeProps,
  ChartSettingGoalInputProps,
  ChartSettingMaxCategoriesProps,
  ChartSettingSegmentedControlProps,
  ChartSettingSegmentsEditorProps,
  ChartSettingSeriesOrderProps,
  ChartSettingTableColumnsProps,
  DimensionsWidgetProps,
  SmartScalarComparisonWidgetProps,
  TreemapGroupsPickerProps,
} from "./widget-props";

export type ColumnSettingDefinition<TValue, TProps = unknown> = {
  title?: string;
  hint?: string;
  widget?: string | ComponentType<any>;
  props?: TProps;
  inline?: boolean;
  readDependencies?: string[];
  getDefault?: (col: DatasetColumn, settings: ColumnSettings) => TValue;
  getHidden?: (col: DatasetColumn, settings: ColumnSettings) => boolean;
  isValid?: (col: DatasetColumn, settings: ColumnSettings) => boolean;
  getProps?: (
    col: DatasetColumn,
    settings: ColumnSettings,
    onChange: (value: TValue) => void,
    extra: { series: Series },
  ) => TProps;
};

export type SettingsExtra = {
  dashboardId?: DashboardId;
  enableEntityNavigation?: boolean;
  forAdminSettings?: boolean;
  isDashboard?: boolean;
  series?: Series;
  settings?: VisualizationSettings;
  transformedSeries?: RawSeries | TransformedSeries;
};

export type VisualizationSettingDefinition<
  T = unknown,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  id?: string;
  title?: string;
  placeholder?: string;
  group?: string;
  index?: number;
  showColumnSetting?: boolean;
  widget?: string | ComponentType<TProps & { id: string }>;
  isValid?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  getHidden?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  getDefault?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => TValue;
  getValue?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => TValue;
  getSection?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => string;
  getWrapperStyle?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => CSSProperties | undefined;
  autoOpenWhenUnset?: boolean;
  set?: boolean;
  persistDefault?: boolean;
  inline?: boolean;
  getProps?: (
    object: T,
    vizSettings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    onChange: (value: TValue) => void,
    extra: SettingsExtra | undefined,
    onChangeSettings: (value: Partial<VisualizationSettings>) => void,
  ) => Partial<TProps>;
  onChange?: (value: TValue) => void;
  onChangeSettings?: (value: Partial<VisualizationSettings>) => void;
  onUpdate?: (value: TValue, extra: SettingsExtra) => void;
  readDependencies?: string[];
  writeDependencies?: string[];
  eraseDependencies?: string[];
  // is the setting visible in the dashboard card viz settings
  dashboard?: boolean;
  useRawSeries?: boolean;
};

export type CompleteVisualizationSettingDefinition<
  T = unknown,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = Omit<
  VisualizationSettingDefinition<T, TValue, TProps>,
  "getProps" | "getWrapperStyle" | "getHidden" | "getSection"
> & {
  id: string;
  style?: CSSProperties;
  props: Partial<TProps>;
  hidden: boolean;
  section?: string;
  value?: TValue;
};

export type DatasetColumnSettingDefinition<
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = VisualizationSettingDefinition<DatasetColumn, TValue, TProps>;

/**
 * current we work with DatasetColumn and Field, but their shapes are different
 */
export type FormattableColumn = Omit<DatasetColumn, "id" | "source"> & {
  id?: DatasetColumn["id"] | Field["id"];
  source?: DatasetColumn["source"];
};

export type SeriesSettingDefinition<
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = VisualizationSettingDefinition<Series, TValue, TProps>;

export type SingleSeriesSettingDefinition<
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = VisualizationSettingDefinition<SingleSeries, TValue, TProps>;

type Value = unknown;

type Props = Record<string, unknown>;

/** Object keys are kept in alphabetical order */
export type VisualizationSettingsDefinitions = {
  _column_title_full?: DatasetColumnSettingDefinition<Value, Props>;
  _header_unit?: DatasetColumnSettingDefinition<Value, Props>;
  _numberFormatter?: DatasetColumnSettingDefinition<Value, Props>;
  axis?: SingleSeriesSettingDefinition<Value, Props>;
  "boxplot.points_mode"?: SeriesSettingDefinition<Value, Props>;
  "boxplot.show_mean"?: SeriesSettingDefinition<Value, Props>;
  "boxplot.show_values_mode"?: SeriesSettingDefinition<Value, Props>;
  "boxplot.whisker_type"?: SeriesSettingDefinition<Value, Props>;
  "card.description"?: SeriesSettingDefinition<Value, Props>;
  "card.hide_empty"?: SeriesSettingDefinition<Value, Props>;
  "card.title"?: SeriesSettingDefinition<Value, Props>;
  click_behavior?: SeriesSettingDefinition<Value, Props>;
  color?: SingleSeriesSettingDefinition<Value, Props>;
  column?: DatasetColumnSettingDefinition<Value, Props>;
  column_settings?: DatasetColumnSettingDefinition<Value, Props>;
  column_title?: DatasetColumnSettingDefinition<Value, Props>;
  currency?: DatasetColumnSettingDefinition<Value, Props>;
  currency_in_header?: DatasetColumnSettingDefinition<Value, Props>;
  currency_style?: DatasetColumnSettingDefinition<Value, Props>;
  date_abbreviate?: DatasetColumnSettingDefinition<Value, Props>;
  date_separator?: DatasetColumnSettingDefinition<Value, Props>;
  date_style?: DatasetColumnSettingDefinition<Value, Props>;
  decimals?: DatasetColumnSettingDefinition<Value, Props>;
  display?: SingleSeriesSettingDefinition<Value, Props>;
  "gauge.range"?: SeriesSettingDefinition<Value, Props>;
  "gauge.segments"?: SeriesSettingDefinition<
    Value,
    ChartSettingSegmentsEditorProps
  >;
  "graph.colors"?: SeriesSettingDefinition<Value, Props>;
  "graph.dimensions"?: SeriesSettingDefinition<Value, Props>;
  "graph.goal_label"?: SeriesSettingDefinition<Value, Props>;
  "graph.goal_value"?: SeriesSettingDefinition<Value, Props>;
  "graph.metrics"?: SeriesSettingDefinition<Value, Props>;
  /**
   * "graph.label_value_frequency" key is used for 2 different settings:
   *   - in waterfall viz and every cartesian viz - as a segmented toggle
   *   - in boxplot viz - as a switch (on/off)
   *
   * It's the only case in VisualizationSettingsDefinitions where 1 setting key has 2 meanings.
   * For simplicity, we're defaulting to segmented toggle widget in types,
   * and we make an exception for the boxplot with a cast.
   */
  "graph.label_value_frequency"?: SeriesSettingDefinition<
    Value,
    ChartSettingSegmentedControlProps
  >;
  "graph.label_value_formatting"?: SeriesSettingDefinition<Value, Props>;
  "graph.max_categories"?: SeriesSettingDefinition<
    Value,
    ChartSettingMaxCategoriesProps
  >;
  "graph.max_categories_enabled"?: SeriesSettingDefinition<Value, Props>;
  "graph.other_category_color"?: SeriesSettingDefinition<Value, Props>;
  "graph.other_category_aggregation_fn"?: SeriesSettingDefinition<Value, Props>;
  "graph.series_labels"?: SeriesSettingDefinition<Value, Props>;
  "graph.series_order"?: SeriesSettingDefinition<
    Value,
    ChartSettingSeriesOrderProps
  >;
  "graph.series_order_dimension"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_goal"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_mean"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_stack_values"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_trendline"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_values"?: SeriesSettingDefinition<Value, Props>;
  "graph.split_panels"?: SeriesSettingDefinition<Value, Props>;
  "graph.stack_value_format"?: SeriesSettingDefinition<
    Value,
    ChartSettingSegmentedControlProps
  >;
  "graph.tooltip_columns"?: SeriesSettingDefinition<Value, Props>;
  "graph.tooltip_type"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis._is_histogram"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis._is_numeric"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis._is_timeseries"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis.axis_enabled"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis.labels_enabled"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis.title_text"?: SeriesSettingDefinition<Value, Props>;
  "graph.x_axis.scale"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.auto_range"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.auto_split"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.labels_enabled"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.max"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.min"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.axis_enabled"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.scale"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.split_number"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.title_text"?: SeriesSettingDefinition<Value, Props>;
  "graph.y_axis.unpin_from_zero"?: SeriesSettingDefinition<Value, Props>;
  "legend.is_reversed"?: SeriesSettingDefinition<Value, Props>;
  "line.interpolate"?: SingleSeriesSettingDefinition<Value, Props>;
  "line.marker_enabled"?: SingleSeriesSettingDefinition<Value, Props>;
  "line.missing"?: SingleSeriesSettingDefinition<Value, Props>;
  "line.size"?: SingleSeriesSettingDefinition<Value, Props>;
  "line.style"?: SingleSeriesSettingDefinition<Value, Props>;
  "link.text"?: SeriesSettingDefinition<Value, Props>;
  "link.url"?: SeriesSettingDefinition<Value, Props>;
  "map.pin_type"?: SeriesSettingDefinition<Value, Props>;
  "map.type"?: SeriesSettingDefinition<Value, Props>;
  "map.region"?: SeriesSettingDefinition<Value, Props>;
  "map.colors"?: SeriesSettingDefinition<Value, ChartSettingColorRangeProps>;
  "map.heat.radius"?: SeriesSettingDefinition<Value, Props>;
  "map.heat.blur"?: SeriesSettingDefinition<Value, Props>;
  "map.heat.min-opacity"?: SeriesSettingDefinition<Value, Props>;
  "map.heat.max-zoom"?: SeriesSettingDefinition<Value, Props>;
  markdown_template?: DatasetColumnSettingDefinition<Value, Props>;
  number_separators?: DatasetColumnSettingDefinition<Value, Props>;
  number_style?: DatasetColumnSettingDefinition<Value, Props>;
  "pie._dimensions_widget"?: SeriesSettingDefinition<
    Value,
    DimensionsWidgetProps
  >;
  "pie.decimal_places"?: SeriesSettingDefinition<Value, Props>;
  "pie.dimension"?: SeriesSettingDefinition<Value, Props>;
  "pie.metric"?: SeriesSettingDefinition<Value, Props>;
  "pie.percent_visibility"?: SeriesSettingDefinition<Value, Props>;
  "pie.rows"?: SeriesSettingDefinition<Value, Props>;
  "pie.slice_threshold"?: SeriesSettingDefinition<Value, Props>;
  "pie.show_labels"?: SeriesSettingDefinition<Value, Props>;
  "pie.show_legend"?: SeriesSettingDefinition<Value, Props>;
  "pie.show_total"?: SeriesSettingDefinition<Value, Props>;
  "pie.sort_rows"?: SeriesSettingDefinition<Value, Props>;
  "pie.sort_rows_dimension"?: SeriesSettingDefinition<Value, Props>;
  prefix?: DatasetColumnSettingDefinition<Value, Props>;
  "progress.color"?: SeriesSettingDefinition<Value, Props>;
  "progress.goal"?: SeriesSettingDefinition<Value, ChartSettingGoalInputProps>;
  "progress.value"?: SeriesSettingDefinition<Value, Props>;
  "sankey.edge_color"?: SeriesSettingDefinition<Value, Props>;
  "sankey.label_value_formatting"?: SeriesSettingDefinition<Value, Props>;
  "sankey.node_align"?: SeriesSettingDefinition<Value, Props>;
  "sankey.show_edge_color"?: SeriesSettingDefinition<Value, Props>;
  "sankey.show_edge_labels"?: SeriesSettingDefinition<Value, Props>;
  "sankey.source"?: SeriesSettingDefinition<Value, Props>;
  "sankey.target"?: SeriesSettingDefinition<Value, Props>;
  "sankey.value"?: SeriesSettingDefinition<Value, Props>;
  "scalar.compact_primary_number"?: SeriesSettingDefinition<Value, Props>;
  "scalar.comparisons"?: SeriesSettingDefinition<
    Value,
    SmartScalarComparisonWidgetProps
  >;
  "scalar.field"?: SeriesSettingDefinition<Value, Props>;
  "scalar.show_comparison_value"?: SeriesSettingDefinition<Value, Props>;
  "scalar.switch_positive_negative"?: SeriesSettingDefinition<Value, Props>;
  scale?: DatasetColumnSettingDefinition<Value, Props>;
  "scatter.bubble"?: SeriesSettingDefinition<Value, Props>;
  show_series_trendline?: SingleSeriesSettingDefinition<Value, Props>;
  show_series_values?: SingleSeriesSettingDefinition<Value, Props>;
  "stackable.stack_type"?: SeriesSettingDefinition<Value, Props>;
  suffix?: DatasetColumnSettingDefinition<Value, Props>;
  "table.columns"?: SeriesSettingDefinition<
    Value,
    ChartSettingTableColumnsProps
  >;
  time_enabled?: DatasetColumnSettingDefinition<Value, Props>;
  time_style?: DatasetColumnSettingDefinition<Value, Props>;
  title?: SingleSeriesSettingDefinition<Value, Props>;
  "treemap._groups_widget"?: SeriesSettingDefinition<
    Value,
    TreemapGroupsPickerProps
  >;
  "treemap.grouping"?: SeriesSettingDefinition<Value, Props>;
  "treemap.rows"?: SeriesSettingDefinition<Value, Props>;
  "treemap.show_leaf_labels"?: SeriesSettingDefinition<Value, Props>;
  "treemap.show_leaf_values"?: SeriesSettingDefinition<Value, Props>;
  "treemap.show_parent_labels"?: SeriesSettingDefinition<Value, Props>;
  "treemap.show_parent_values"?: SeriesSettingDefinition<Value, Props>;
  "treemap.sub_grouping"?: SeriesSettingDefinition<Value, Props>;
  "treemap.value"?: SeriesSettingDefinition<Value, Props>;
  view_as?: SeriesSettingDefinition<Value, Props>;
  "waterfall.decrease_color"?: SeriesSettingDefinition<Value, Props>;
  "waterfall.increase_color"?: SeriesSettingDefinition<Value, Props>;
  "waterfall.show_total"?: SeriesSettingDefinition<Value, Props>;
  "waterfall.total_color"?: SeriesSettingDefinition<Value, Props>;
  /**
   * TODO: next line should be removed when VisualizationSettingsDefinitions and VisualizationSettings are complete.
   * Once that happens, it should be possible to safely use VisualizationSettingKey for
   * both VisualizationSettings and VisualizationSettingsDefinitions.
   */
  [key: string]: any;
};

export type Widget = {
  id: string;
  section?: string;
  hidden?: boolean;
  props?: Record<string, unknown>;
  title?: string;
  widget?: string | ComponentType<any>;
};

export type VisualizationGridSize = {
  // grid columns
  width: number;
  // grid rows
  height: number;
};

export type VisualizationDefinition = {
  name?: string;
  noun?: string;
  getUiName: () => string;
  identifier: VisualizationDisplay;
  aliases?: string[];
  iconName?: IconName;
  iconUrl?: string;
  hasEmptyState?: boolean;
  isDev?: boolean; // is custom viz in dev mode

  maxMetricsSupported?: number;
  maxDimensionsSupported?: number;

  disableClickBehavior?: boolean;
  canSavePng?: boolean;
  noHeader?: boolean;
  noLoadingHeader?: boolean;
  hidden?: boolean;
  disableSettingsConfig?: boolean;
  supportPreviewing?: boolean;
  supportsVisualizer?: boolean;
  disableVisualizer?: boolean;

  minSize?: VisualizationGridSize;
  defaultSize?: VisualizationGridSize;

  settings?: VisualizationSettingsDefinitions;

  transformSeries?: (series: Series) => TransformedSeries;
  isSensible?: (data: DatasetData) => boolean;
  columnSettings?:
    | VisualizationSettingsDefinitions
    | ((column: FormattableColumn) => VisualizationSettingsDefinitions);
  // checkRenderable throws an error if a visualization is not renderable
  checkRenderable: (
    series: Series,
    settings: VisualizationSettings,
  ) => void | never;
  isLiveResizable?: (series: Series) => boolean;
  onDisplayUpdate?: (settings: VisualizationSettings) => VisualizationSettings;
};
