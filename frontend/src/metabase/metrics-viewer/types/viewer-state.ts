import type { MetricDefinition } from "metabase-lib/metric";
import type {
  CardDisplayType,
  ConcreteTableId,
  DimensionId,
  TemporalUnit,
} from "metabase-types/api";

import { DISPLAY_TYPE_REGISTRY } from "../utils";
import type { DimensionFilterValue } from "../utils/metrics";

// ── Core types ──

export type MetricsViewerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie" | "scatter"
>;

export type MetricSourceId = `metric:${number}` | `measure:${number}`;

export type MetricsViewerTabType =
  | "time"
  | "geo"
  | "category"
  | "boolean"
  | "numeric";

export interface StoredMetricsViewerTab {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  dimensionsBySource: Record<MetricSourceId, DimensionId>;
}

// ── Definition types ──

/**
 * Represents a metric/measure definition entry in the viewer state.
 *
 * Breakout handling: When a user selects a breakout dimension, it is applied
 * immediately to `definition` as a projection (via LibMetric.project).
 * The entry's definition has 0-1 projections where that projection IS the breakout.
 *
 * This is different from the computed/modified definition (from getModifiedDefinition)
 * which adds the tab's dimension as an additional projection.
 */
export interface MetricsViewerDefinitionEntry {
  id: MetricSourceId;
  definition: MetricDefinition | null;
}

// ── Tab state ──

export interface MetricsViewerTabLayoutState {
  split: boolean;
  spacing: number;
}

export interface MetricsViewerTabProjectionConfig {
  temporalUnit?: TemporalUnit;
  binningStrategy?: string;
  dimensionFilter?: DimensionFilterValue;
}

export interface MetricsViewerTabState {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  display: MetricsViewerDisplayType;
  dimensionMapping: Record<MetricSourceId, DimensionId>;
  projectionConfig: MetricsViewerTabProjectionConfig;
  layout: MetricsViewerTabLayoutState;
}

export function getInitialMetricsViewerTabLayout(
  displayType: MetricsViewerDisplayType,
): MetricsViewerTabLayoutState {
  const { supportsMultipleSeries } = DISPLAY_TYPE_REGISTRY[displayType];
  return {
    split: !supportsMultipleSeries,
    spacing: 3,
  };
}

// ── Page state ──

export interface MetricsViewerPageState {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  selectedTabId: string | null;
}

export function getInitialMetricsViewerPageState(): MetricsViewerPageState {
  return {
    definitions: [],
    tabs: [],
    selectedTabId: null,
  };
}

// ── Color mapping ──

export type SourceColorMap = Partial<Record<MetricSourceId, string[]>>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};
