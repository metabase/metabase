import type { DimensionType } from "metabase/metrics/common/utils/dimension-types";
import type { MetricDefinition } from "metabase-lib/metric";
import type {
  CardDisplayType,
  ConcreteTableId,
  DimensionId,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

import type { DimensionFilterValue } from "../utils/dimension-filters";

// ── Core types ──

export type MetricsViewerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie" | "scatter"
>;

export type MetricSourceId = `metric:${number}` | `measure:${number}`;

export type MetricsViewerTabType = DimensionType;

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

export interface MetricsViewerTabProjectionConfig {
  temporalUnit?: TemporalUnit;
  binningStrategy?: string;
  dimensionFilter?: DimensionFilterValue;
}

export interface MetricsViewerTabState {
  id: string;
  type: MetricsViewerTabType;
  label: string | null;
  display: MetricsViewerDisplayType;
  visualizationSettings?: Partial<VisualizationSettings>;
  dimensionMapping: Record<MetricSourceId, DimensionId | null>;
  projectionConfig: MetricsViewerTabProjectionConfig;
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

/**
 * A map of breakout display values to colors.
 */
export type BreakoutColorMap = Map<string, string>;

/**
 * Values are either BreakoutColorMap or a single color for non-breakout sources.
 */
export type SourceBreakoutColorMap = Partial<
  Record<MetricSourceId, BreakoutColorMap | string>
>;

/**
 * For consumers that expect an array of colors and don't care about breakout values.
 */
export type SourceColorMap = Partial<Record<MetricSourceId, string[]>>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string | null;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};
