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
  // [key: string]: unknown; // TODO
};

export type VisualizationSettingDefinition<
  T = unknown,
  TValue = unknown,
  TProps extends object = object,
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

export type VisualizationSettingsDefinitions<
  T = unknown,
  TValue = unknown,
  TProps extends object = object,
> = {
  [key: string]: VisualizationSettingDefinition<T, TValue, TProps>;
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

export type VisualizationDefinition<
  T = unknown,
  TValue = unknown,
  TProps extends object = object,
> = {
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

  settings: VisualizationSettingsDefinitions<T, TValue, TProps>;

  transformSeries?: (series: Series) => TransformedSeries;
  isSensible: (data: DatasetData) => boolean;
  columnSettings?:
    | VisualizationSettingsDefinitions<T, TValue, TProps>
    | ((
        column: DatasetColumn,
      ) => VisualizationSettingsDefinitions<T, TValue, TProps>);
  // checkRenderable throws an error if a visualization is not renderable
  checkRenderable: (
    series: Series,
    settings: VisualizationSettings,
  ) => void | never;
  isLiveResizable?: (series: Series) => boolean;
  onDisplayUpdate?: (settings: VisualizationSettings) => VisualizationSettings;
};
