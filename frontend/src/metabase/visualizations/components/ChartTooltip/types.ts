import { MouseEvent } from "react";
import { TimelineEvent } from "metabase-types/api/timeline";
import { DatasetColumn, VisualizationSettings } from "metabase-types/api";
import { TooltipModel } from "./DataPointTooltip/types";

export interface DataPoint {
  key: string;
  col?: DatasetColumn;
  value?: unknown;
  isHovered?: boolean;
  color?: string;
  percent?: number;
}

export interface HoveredDimension {
  value: string;
  column: DatasetColumn;
}

export interface HoveredTimelineEvent {
  timelineEvents: TimelineEvent[];
  element: HTMLElement;
}

export interface HoveredObject {
  index?: number;
  axisIndex?: number;
  seriesIndex?: number;
  value?: unknown;
  column?: DatasetColumn;
  timelineEvents?: TimelineEvent[];
  data?: DataPoint[];
  dimensions?: HoveredDimension[];
  settings?: VisualizationSettings;
  element?: HTMLElement;
  event?: MouseEvent;
  totalValue?: number;

  dataTooltip?: TooltipModel;
}
