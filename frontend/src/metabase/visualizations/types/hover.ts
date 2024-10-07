import type { ClickObjectDataRow } from "metabase-lib";
import type { RowValue, TimelineEvent } from "metabase-types/api";

import type { RemappingHydratedDatasetColumn } from "./columns";
import type { ComputedVisualizationSettings } from "./visualization";

export interface DataPoint extends ClickObjectDataRow {
  key: string;
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
  value: RowValue;
  formatter?: (value: RowValue) => string;
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
  seriesIndex?: number;
  seriesId?: number;
  datumIndex?: number;
  value?: unknown;
  column?: RemappingHydratedDatasetColumn;
  timelineEvents?: TimelineEvent[];
  data?: DataPoint[];
  footerData?: DataPoint[];
  dimensions?: HoveredDimension[];
  settings?: ComputedVisualizationSettings;
  element?: Element;
  event?: MouseEvent;
  stackedTooltipModel?: StackedTooltipModel;
  isAlreadyScaled?: boolean;
  pieSliceKeyPath?: string[];
  pieLegendHoverIndex?: number;
}
