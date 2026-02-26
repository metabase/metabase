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

import type { LegacySeriesSettingsObjectKey } from "../echarts/cartesian/model/types";

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
  [key: string]: unknown; // TODO
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
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  hidden?: boolean;
  getHidden?: (
    object: T,
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  getDefault?: (
    object: T,
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => TValue;
  getValue?: (
    object: T,
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => TValue;
  getDisabled?: (
    object: T,
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => boolean;
  getSection?: (
    object: T,
    settings: ComputedVisualizationSettings,
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
    settings: ComputedVisualizationSettings,
    extra?: SettingsExtra,
  ) => string;
  persistDefault?: boolean;
  inline?: boolean;
  props?: TProps;
  getProps?: (
    object: T,
    vizSettings: ComputedVisualizationSettings,
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

export type VisualizationSettingsDefinitions<
  _T = unknown,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  _column_title_full?: DatasetColumnSettingDefinition<TValue, TProps>;
  _header_unit?: DatasetColumnSettingDefinition<TValue, TProps>;
  _numberFormatter?: DatasetColumnSettingDefinition<TValue, TProps>;
  axis?: SingleSeriesSettingDefinition<TValue, TProps>;
  "boxplot.points_mode"?: SeriesSettingDefinition<TValue, TProps>;
  "boxplot.show_values_mode"?: SeriesSettingDefinition<TValue, TProps>;
  "card.description"?: SeriesSettingDefinition<TValue, TProps>;
  "card.hide_empty"?: SeriesSettingDefinition<TValue, TProps>;
  "card.title"?: SeriesSettingDefinition<TValue, TProps>;
  click_behavior?: SeriesSettingDefinition<TValue, TProps>;
  color?: SingleSeriesSettingDefinition<TValue, TProps>;
  column?: DatasetColumnSettingDefinition<TValue, TProps>;
  column_settings?: DatasetColumnSettingDefinition<TValue, TProps>;
  currency?: DatasetColumnSettingDefinition<TValue, TProps>;
  currency_in_header?: DatasetColumnSettingDefinition<TValue, TProps>;
  currency_style?: DatasetColumnSettingDefinition<TValue, TProps>;
  date_abbreviate?: DatasetColumnSettingDefinition<TValue, TProps>;
  date_separator?: DatasetColumnSettingDefinition<TValue, TProps>;
  date_style?: DatasetColumnSettingDefinition<TValue, TProps>;
  decimals?: DatasetColumnSettingDefinition<TValue, TProps>;
  display?: SingleSeriesSettingDefinition<TValue, TProps>;
  "gauge.range"?: SeriesSettingDefinition<TValue, TProps>;
  "gauge.segments"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.colors"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.dimensions"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.metrics"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.label_value_frequency"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.label_value_formatting"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.max_categories"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.max_categories_enabled"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.other_category_color"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.other_category_aggregation_fn"?: SeriesSettingDefinition<
    TValue,
    TProps
  >;
  "graph.series_labels"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.series_order"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.series_order_dimension"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.show_mean"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.show_stack_values"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.show_trendline"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.show_values"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.tooltip_columns"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.tooltip_type"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis._is_histogram"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis._is_numeric"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis._is_timeseries"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis.axis_enabled"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis.labels_enabled"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis.title_text"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.x_axis.scale"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.auto_range"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.auto_split"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.labels_enabled"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.max"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.min"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.axis_enabled"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.scale"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.split_number"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.title_text"?: SeriesSettingDefinition<TValue, TProps>;
  "graph.y_axis.unpin_from_zero"?: SeriesSettingDefinition<TValue, TProps>;
  "legend.is_reversed"?: SeriesSettingDefinition<TValue, TProps>;
  "line.interpolate"?: SingleSeriesSettingDefinition<TValue, TProps>;
  "line.marker_enabled"?: SingleSeriesSettingDefinition<TValue, TProps>;
  "line.missing"?: SingleSeriesSettingDefinition<TValue, TProps>;
  "line.size"?: SingleSeriesSettingDefinition<TValue, TProps>;
  "line.style"?: SingleSeriesSettingDefinition<TValue, TProps>;
  markdown_template?: DatasetColumnSettingDefinition<TValue, TProps>;
  number_separators?: DatasetColumnSettingDefinition<TValue, TProps>;
  number_style?: DatasetColumnSettingDefinition<TValue, TProps>;
  "pie._dimensions_widget"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.decimal_places"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.dimension"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.metric"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.percent_visibility"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.rows"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.slice_threshold"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.show_labels"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.show_legend"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.show_total"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.sort_rows"?: SeriesSettingDefinition<TValue, TProps>;
  "pie.sort_rows_dimension"?: SeriesSettingDefinition<TValue, TProps>;
  prefix?: DatasetColumnSettingDefinition<TValue, TProps>;
  "progress.color"?: SeriesSettingDefinition<TValue, TProps>;
  "progress.goal"?: SeriesSettingDefinition<TValue, TProps>;
  "progress.value"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.edge_color"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.label_value_formatting"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.node_align"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.show_edge_color"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.show_edge_labels"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.source"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.target"?: SeriesSettingDefinition<TValue, TProps>;
  "sankey.value"?: SeriesSettingDefinition<TValue, TProps>;
  "scalar.compact_primary_number"?: SeriesSettingDefinition<TValue, TProps>;
  "scalar.comparisons"?: SeriesSettingDefinition<TValue, TProps>;
  "scalar.field"?: SeriesSettingDefinition<TValue, TProps>;
  "scalar.switch_positive_negative"?: SeriesSettingDefinition<TValue, TProps>;
  scale?: DatasetColumnSettingDefinition<TValue, TProps>;
  "scatter.bubble"?: SeriesSettingDefinition<TValue, TProps>;
  show_series_trendline?: SingleSeriesSettingDefinition<TValue, TProps>;
  show_series_values?: SingleSeriesSettingDefinition<TValue, TProps>;
  "stackable.stack_type"?: SeriesSettingDefinition<TValue, TProps>;
  suffix?: DatasetColumnSettingDefinition<TValue, TProps>;
  "table.columns"?: SeriesSettingDefinition<TValue, TProps>;
  time_enabled?: DatasetColumnSettingDefinition<TValue, TProps>;
  time_style?: DatasetColumnSettingDefinition<TValue, TProps>;
  title?: SingleSeriesSettingDefinition<TValue, TProps>;
  // [key: string]: VisualizationSettingDefinition<unknown, TValue, TProps>
};

export type CompleteVisualizationSettingDefinition<
  T = unknown,
  TValue = unknown,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = VisualizationSettingDefinition<T, TValue, TProps> & {
  id: string;
  section: string;
};

export type Widget = {
  id: string;
  section: string;
  hidden?: boolean;
  props?: Record<string, unknown>;
  title?: string;
  widget?: string | React.ComponentType<any>;
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
