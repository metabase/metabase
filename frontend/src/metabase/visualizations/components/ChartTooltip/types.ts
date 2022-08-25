import { MouseEvent } from "react";
import { Column } from "metabase-types/types/Dataset";
import { TimelineEvent } from "metabase-types/api/timeline";

export type VisualizationSettings = Record<string, unknown> & {
  column?: (col: Column) => Column;
};

export interface DataPoint {
  key: string;
  col?: Column;
  value?: unknown;
}

export interface HoveredDimension {
  value: string;
  column: Column;
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
  column?: Column;
  timelineEvents?: TimelineEvent[];
  data?: DataPoint[];
  dimensions?: HoveredDimension[];
  settings?: VisualizationSettings;
  element?: HTMLElement;
  event?: MouseEvent;
}
