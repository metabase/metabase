import { MouseEvent } from "react";
import { TimelineEvent } from "metabase-types/api/timeline";
import { RemappingHydratedDatasetColumn } from "metabase/visualizations/shared/types/data";

export type VisualizationSettings = Record<string, unknown> & {
  column?: (
    col: RemappingHydratedDatasetColumn,
  ) => RemappingHydratedDatasetColumn;
};

export interface DataPoint {
  key: string;
  col?: RemappingHydratedDatasetColumn;
  value?: unknown;
}

export interface HoveredDimension {
  value: string;
  column: RemappingHydratedDatasetColumn;
}

export interface HoveredTimelineEvent {
  timelineEvents: TimelineEvent[];
  element: HTMLElement;
}

export interface TooltipRowModel {
  color?: string;
  name: string;
  value: unknown;
  formatter?: (value: unknown) => string;
}

export interface StackedTooltipModel {
  headerTitle?: string;
  headerRows: TooltipRowModel[];
  bodyRows?: TooltipRowModel[];
  totalFormatter?: (value: unknown) => string;
  showTotal?: boolean;
  showPercentages?: boolean;
  grandTotal?: number;
}

export interface HoveredObject {
  index?: number;
  axisIndex?: number;
  seriesIndex?: number;
  value?: unknown;
  column?: RemappingHydratedDatasetColumn;
  timelineEvents?: TimelineEvent[];
  data?: DataPoint[];
  dimensions?: HoveredDimension[];
  settings?: VisualizationSettings;
  element?: HTMLElement;
  event?: MouseEvent;
  stackedTooltipModel?: StackedTooltipModel;
}
