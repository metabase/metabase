import type { ComponentType, ReactNode } from "react";

import type { OptionsType } from "metabase/lib/formatting/types";
import type { IconName, IconProps } from "metabase/ui";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import type {
  TextHeightMeasurer,
  TextWidthMeasurer,
} from "metabase/visualizations/shared/types/measure-text";
import type {
  ClickActionModeGetter,
  ClickObject,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Card,
  Dashboard,
  DashboardCard,
  DashboardId,
  DatasetColumn,
  DatasetData,
  RawSeries,
  RowValue,
  Series,
  SeriesSettings,
  SingleSeries,
  TimelineEvent,
  TimelineEventId,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizationDisplay } from "metabase-types/api/visualization";
import type { Dispatch, QueryBuilderMode } from "metabase-types/store";

import type { ChartSettingEnumToggleProps } from "../components/settings/ChartSettingEnumToggle";
import type { ChartSettingGoalInputProps } from "../components/settings/ChartSettingGoalInput";
import type { ChartSettingMaxCategoriesProps } from "../components/settings/ChartSettingMaxCategories";
import type { ChartSettingSegmentedControlProps } from "../components/settings/ChartSettingSegmentedControl";
import type { ChartSettingSegmentsEditorProps } from "../components/settings/ChartSettingSegmentsEditor";
import type { ChartSettingSeriesOrderProps } from "../components/settings/ChartSettingSeriesOrder";
import type { ChartSettingTableColumnsProps } from "../components/settings/ChartSettingTableColumns";
import type { LegacySeriesSettingsObjectKey } from "../echarts/cartesian/model/types";
import type { DimensionsWidgetProps } from "../visualizations/PieChart/DimensionsWidget";
import type { SmartScalarComparisonWidgetProps } from "../visualizations/SmartScalar/SettingsComponents/SmartScalarSettingsWidgets";

import type { RemappingHydratedDatasetColumn } from "./columns";
import type { HoveredObject } from "./hover";

export interface Padding {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type Formatter = (value: unknown, options?: OptionsType) => string;
export type TableCellFormatter = (value: RowValue) => ReactNode;

export type ColorGetter = (colorName: string) => string;

export interface RenderingContext {
  getColor: ColorGetter;
  measureText: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  fontFamily: string;

  theme: VisualizationTheme;
}

/**
 * Visualization theming overrides.
 * Refer to DEFAULT_METABASE_COMPONENT_THEME for the default values.
 **/
export interface VisualizationTheme {
  cartesian: {
    label: {
      fontSize: number;
    };
    goalLine: {
      label: {
        fontSize: number;
      };
    };
    splitLine: {
      lineStyle: {
        color: string;
      };
    };
  };
  pie: {
    borderColor: string;
  };
}

export type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
  seriesIndex?: number;
  objectId?: number;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

export type ColumnSettings = OptionsType & {
  _column_title_full?: string;
  "pivot_table.column_show_totals"?: boolean;
  text_align?: "left" | "middle" | "right";
  [key: string]: unknown;
};

export type ComputedVisualizationSettings = VisualizationSettings & {
  column?: (col: RemappingHydratedDatasetColumn) => ColumnSettings;
  series?: (key: LegacySeriesSettingsObjectKey) => SeriesSettings;
  nested?: (value: unknown) => unknown;
};

export interface StaticVisualizationProps {
  rawSeries: RawSeries;
  renderingContext: RenderingContext;
  isStorybook?: boolean;
  hasDevWatermark?: boolean;
}

export interface VisualizationProps {
  series: Series;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  card: Card;
  getHref?: () => string | undefined;
  data: DatasetData;
  metadata?: Metadata;
  rawSeries: RawSeries;
  visualizerRawSeries?: RawSeries;
  settings: ComputedVisualizationSettings;
  hiddenSeries?: Set<string>;
  headerIcon?: IconProps | null;
  errorIcon?: IconName | null;
  actionButtons?: ReactNode;
  fontFamily: string;
  isFullscreen: boolean;
  isQueryBuilder: boolean;
  isEmbeddingSdk: boolean;
  showTitle: boolean;
  isDashboard: boolean;
  isDocument: boolean;
  // Is this the visualization *inside* the visualizer
  isVisualizer: boolean;
  // Is this visualization made by the visualizer
  isVisualizerCard: boolean;
  isEditing: boolean;
  isMobile: boolean;
  isSettings: boolean;
  showAllLegendItems?: boolean;
  isRawTable?: boolean;
  scrollToLastColumn?: boolean;
  hovered?: HoveredObject | null;
  clicked?: ClickObject | null;
  className?: string;
  timelineEvents?: TimelineEvent[];
  selectedTimelineEventIds?: TimelineEventId[];
  queryBuilderMode?: QueryBuilderMode;

  gridSize?: VisualizationGridSize;
  width: number;
  height: number;

  visualizationIsClickable: (clickObject: ClickObject | null) => boolean;
  getExtraDataForClick?: (
    clickObject: ClickObject | null,
  ) => Record<string, unknown>;

  onRender: ({
    yAxisSplit,
    warnings,
  }: {
    yAxisSplit?: number[][];
    warnings?: string[];
  }) => void;
  onRenderError: (error?: string) => void;
  onActionDismissal: () => void;
  onChangeCardAndRun?: OnChangeCardAndRun | null;
  onHoverChange: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick: (clickObject: ClickObject | null) => void;
  onUpdateVisualizationSettings: (
    settings: VisualizationSettings,
    question?: Question,
  ) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenTimelines?: () => void;

  canToggleSeriesVisibility?: boolean;
  onUpdateWarnings?: any;

  dispatch: Dispatch;

  /**
   * Items that will be shown in a menu when the title is clicked.
   * Used for visualizer cards to jump to underlying questions
   */
  titleMenuItems?: ReactNode;
}

export type VisualizationPassThroughProps = {
  // frontend/src/metabase/query_builder/components/VisualizationResult.jsx
  canToggleSeriesVisibility?: boolean;
  isObjectDetail?: boolean;
  isQueryBuilder?: boolean;
  queryBuilderMode?: QueryBuilderMode;
  zoomedRowIndex?: number;
  onDeselectTimelineEvents?: () => void;
  onOpenTimelines?: () => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;

  // Table
  isShowingDetailsOnlyColumns?: boolean;

  // Table Interactive
  hasMetadataPopovers?: boolean;
  tableHeaderHeight?: number;
  scrollToColumn?: number;
  renderTableHeader?: (
    column: number,
    index: number,
    theme: unknown,
  ) => ReactNode;
  mode?: ClickActionModeGetter | Mode | QueryClickActionsMode;
  renderEmptyMessage?: boolean;

  // frontend/src/metabase/dashboard/components/DashCard/DashCardVisualization.tsx
  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isPreviewing?: boolean;
  totalNumGridCols?: number;
  onTogglePreviewing?: () => void;

  showAllLegendItems?: boolean;

  onHeaderColumnReorder?: (columnName: string) => void;

  /**
   * Items that will be shown in a menu when the title is clicked.
   * Used for visualizer cards to jump to underlying questions
   */
  titleMenuItems?: ReactNode[];

  // frontend/src/metabase/visualizations/components/ChartSettings/ChartSettingsVisualization/ChartSettingsVisualization.tsx
  isSettings?: boolean;

  /**
   * Extra buttons to be shown in the table footer (if the visualization is a table)
   */
  tableFooterExtraButtons?: ReactNode;

  /**
   * Props used for Audit Table visualization
   */
  isSelectable?: boolean;
  rowChecked?: [];
  onAllSelectClick?: () => void;
  onRowSelectClick?: () => void;
};

export type ColumnSettingDefinition<TValue, TProps = unknown> = {
  title?: string;
  hint?: string;
  widget?: string | ComponentType<any>;
  default?: TValue;
  props?: TProps;
  inline?: boolean;
  readDependencies?: string[];
  getDefault?: (col: DatasetColumn, settings: OptionsType) => TValue;
  getHidden?: (col: DatasetColumn, settings: OptionsType) => boolean;
  isValid?: (col: DatasetColumn, settings: OptionsType) => boolean;
  getProps?: (
    col: DatasetColumn,
    settings: OptionsType,
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
  section?: string;
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
  hidden?: boolean;
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
  getDisabled?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  getSection?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => string;
  autoOpenWhenUnset?: boolean;
  disabled?: boolean;
  default?: TValue;
  marginBottom?: string;
  noPadding?: boolean;
  value?: TValue;
  set?: boolean;
  getMarginBottom?: (
    object: T,
    settings: T extends DatasetColumn
      ? ColumnSettings
      : ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => string;
  persistDefault?: boolean;
  inline?: boolean;
  props?: Partial<TProps>;
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
> = VisualizationSettingDefinition<T, TValue, TProps> & {
  id: string;
  section: string;
};

export type DatasetColumnSettingDefinition<
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = VisualizationSettingDefinition<DatasetColumn, TValue, TProps>;

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
export type VisualizationSettingsDefinitions<
  LabelValueFrequencyWidgetProps extends Props =
    | ChartSettingEnumToggleProps
    | ChartSettingSegmentedControlProps,
> = {
  _column_title_full?: DatasetColumnSettingDefinition<Value, Props>;
  _header_unit?: DatasetColumnSettingDefinition<Value, Props>;
  _numberFormatter?: DatasetColumnSettingDefinition<Value, Props>;
  axis?: SingleSeriesSettingDefinition<Value, Props>;
  "boxplot.points_mode"?: SeriesSettingDefinition<Value, Props>;
  "boxplot.show_values_mode"?: SeriesSettingDefinition<Value, Props>;
  "card.description"?: SeriesSettingDefinition<Value, Props>;
  "card.hide_empty"?: SeriesSettingDefinition<Value, Props>;
  "card.title"?: SeriesSettingDefinition<Value, Props>;
  click_behavior?: SeriesSettingDefinition<Value, Props>;
  color?: SingleSeriesSettingDefinition<Value, Props>;
  column?: DatasetColumnSettingDefinition<Value, Props>;
  column_settings?: DatasetColumnSettingDefinition<Value, Props>;
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
  "graph.metrics"?: SeriesSettingDefinition<Value, Props>;
  "graph.label_value_frequency"?: SeriesSettingDefinition<
    Value,
    LabelValueFrequencyWidgetProps
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
  "graph.show_mean"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_stack_values"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_trendline"?: SeriesSettingDefinition<Value, Props>;
  "graph.show_values"?: SeriesSettingDefinition<Value, Props>;
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
  /**
   * TODO: next line should be removed when VisualizationSettingsDefinitions and VisualizationSettings are complete.
   * Once that happens, it should be possible to safely use VisualizationSettingKey for
   * both VisualizationSettings and VisualizationSettingsDefinitions.
   */
  [key: string]: any;
};

export type Widget = {
  id: string;
  section: string;
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

// TODO: add component property for the react component instead of the intersection
export type Visualization = ComponentType<
  Omit<VisualizationProps, "width" | "height"> & {
    width?: number | null;
    height?: number | null;
  } & VisualizationPassThroughProps
> &
  VisualizationDefinition;

export type VisualizationDefinition = {
  name?: string;
  noun?: string;
  getUiName: () => string;
  identifier: VisualizationDisplay;
  aliases?: string[];
  iconName: IconName;
  hasEmptyState?: boolean;

  maxMetricsSupported?: number;
  maxDimensionsSupported?: number;

  disableClickBehavior?: boolean;
  canSavePng?: boolean;
  noHeader?: boolean;
  hidden?: boolean;
  disableSettingsConfig?: boolean;
  supportPreviewing?: boolean;
  supportsVisualizer?: boolean;
  disableVisualizer?: boolean;

  minSize: VisualizationGridSize;
  defaultSize: VisualizationGridSize;

  settings: VisualizationSettingsDefinitions;

  transformSeries?: (series: Series) => TransformedSeries;
  isSensible: (data: DatasetData) => boolean;
  columnSettings?:
    | VisualizationSettingsDefinitions
    | ((column: DatasetColumn) => VisualizationSettingsDefinitions);
  // checkRenderable throws an error if a visualization is not renderable
  checkRenderable: (
    series: Series,
    settings: VisualizationSettings,
  ) => void | never;
  isLiveResizable?: (series: Series) => boolean;
  onDisplayUpdate?: (settings: VisualizationSettings) => VisualizationSettings;
};
