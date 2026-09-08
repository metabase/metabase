import type { ComponentType, ReactNode } from "react";

import type { Dispatch, QueryBuilderMode } from "metabase/redux/store";
import type { IconProps } from "metabase/ui";
import type { DashcardSizeTier } from "metabase/visualizations/lib/dashcard-sizing";
import type {
  ComputedVisualizationSettings,
  HighlightedObject,
  HoveredObject,
  VisualizationDefinition,
  VisualizationGridSize,
} from "metabase/viz-core";
import type { BrushClickObject } from "metabase-lib/query/types";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Dashboard,
  DashboardCard,
  DatasetColumn,
  DatasetData,
  IconName,
  RawSeries,
  RowValue,
  RowValues,
  Series,
  SeriesCard,
  TimelineEvent,
  TimelineEventId,
  VisualizationSettings,
} from "metabase-types/api";

import type { ClickActionsMode, ClickObject } from "./click-actions";

export type TableCellFormatter = (value: RowValue) => ReactNode;

export type CardSlownessStatus = "usually-fast" | "usually-slow" | boolean;

export type OnChangeCardAndRunOpts = {
  nextCard: SeriesCard;
  seriesIndex?: number;
  objectId?: number;
  drillName?: string;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

export type OnBrush = (options: {
  clickObject: BrushClickObject;
  openClickActions: (clicked: ClickObject | null) => void;
}) => void;

export interface VisualizationProps {
  series: Series;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  sizeTier?: DashcardSizeTier;
  card: SeriesCard;
  getHref?: () => string | undefined;
  data: DatasetData;
  metadata?: Metadata;
  rawSeries: RawSeries;
  visualizerRawSeries?: RawSeries;
  settings: ComputedVisualizationSettings;
  autoAdjustSettings?: boolean;
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
  isMetricsViewer: boolean;
  isMobile: boolean;
  isSettings: boolean;
  showAllLegendItems?: boolean;
  hideLegend?: boolean;
  isRawTable?: boolean;
  scrollToLastColumn?: boolean;
  hovered?: HoveredObject | null;
  highlighted?: HighlightedObject | null;
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
  onBrush?: OnBrush | null;
  onHoverChange: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick: (clickObject: ClickObject | null) => void;
  onUpdateVisualizationSettings: (
    settings: VisualizationSettings,
    question?: Question,
  ) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSeeAllEvents?: (timelineEvents: TimelineEvent[]) => void;

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
  isStandaloneQuestion?: boolean;
  queryBuilderMode?: QueryBuilderMode;
  zoomedRowIndex?: number;
  onZoomRow?: (rowIndex: number) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onSeeAllEvents?: (timelineEvents: TimelineEvent[]) => void;

  // Table
  isShowingDetailsOnlyColumns?: boolean;

  // Table Interactive
  hasMetadataPopovers?: boolean;
  tableHeaderHeight?: number;
  scrollToColumn?: number;
  renderTableHeader?: (
    column: DatasetColumn,
    index: number,
    theme: unknown,
  ) => ReactNode;
  mode?: ClickActionsMode;
  /**
   * Lets users drag column headers to reorder the columns.
   * Without it the table shows the outline header, the style used for read-only previews.
   */
  hasColumnReordering?: boolean;
  renderEmptyMessage?: boolean;

  // frontend/src/metabase/dashboard/components/DashCard/DashCardVisualization.tsx
  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isPreviewing?: boolean;
  totalNumGridCols?: number;
  onTogglePreviewing?: () => void;

  /**
   * Maps a click object to the one click actions should be computed for,
   * supplied for visualizer cards whose rendered columns are remapped from the underlying questions.
   */
  transformClickObject?: (clicked: ClickObject) => ClickObject;

  showAllLegendItems?: boolean;

  onHeaderColumnReorder?: (columnIndex: number) => void;

  /**
   * Items that will be shown in a menu when the title is clicked.
   * Used for visualizer cards to jump to underlying questions
   */
  titleMenuItems?: ReactNode;

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
  rowChecked?: Record<string, boolean>;
  onAllSelectClick?: (event: { rows: RowValues[] }) => void;
  onRowSelectClick?: (event: { row: RowValues; rowIndex: number }) => void;
  isSortable?: boolean;
  sorting?: AuditTableSorting;
  onSortingChange?: (sorting: AuditTableSorting) => void;
};

export type AuditTableSorting = {
  column: string;
  isAscending: boolean;
};

export type VisualizationComponent = ComponentType<
  VisualizationProps & VisualizationPassThroughProps
>;

// TODO: add component property for the react component instead of the intersection
export type Visualization = VisualizationComponent & VisualizationDefinition;
