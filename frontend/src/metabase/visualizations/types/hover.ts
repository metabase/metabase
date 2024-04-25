import type { TimelineEvent } from "metabase-types/api";

import type { RemappingHydratedDatasetColumn } from "./columns";
import type { ComputedVisualizationSettings } from "./visualization";

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
  element: Element;
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
  datumIndex?: number;
  value?: unknown;
  column?: RemappingHydratedDatasetColumn;
  timelineEvents?: TimelineEvent[];
  data?: DataPoint[];
  dimensions?: HoveredDimension[];
  settings?: ComputedVisualizationSettings;
  element?: Element;
  event?: MouseEvent;
  stackedTooltipModel?: StackedTooltipModel;
}
