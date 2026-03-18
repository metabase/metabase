import type { MetricDefinition } from "metabase-lib/metric";
import type {
  CardDisplayType,
  ConcreteTableId,
  DimensionId,
  TemporalUnit,
} from "metabase-types/api";

import type { DimensionFilterValue } from "../utils/dimension-filters";

import type { MathOperator } from "./operators";

// ── Core types ──

export type MetricsViewerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie" | "scatter"
>;

export type MetricSourceId = `metric:${number}` | `measure:${number}`;
export type MetricExpressionId = `expression:${number}`;

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

// ── Expression sub-tokens ──

/**
 * Tokens that appear inside a single expression formula.
 * These are the building blocks of an expression definition entry.
 */
export type ExpressionSubToken =
  | { type: "metric"; sourceId: MetricSourceId }
  | { type: "constant"; value: number }
  | { type: "operator"; op: MathOperator }
  | { type: "open-paren" }
  | { type: "close-paren" };

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
export type MetricsViewerDefinitionEntry =
  | {
      id: MetricSourceId;
      type: "metric";
      definition: MetricDefinition | null;
    }
  | {
      id: MetricExpressionId;
      type: "expression";
      name: string;
      tokens: ExpressionSubToken[];
    };

export type MetricDefinitionEntry = Extract<
  MetricsViewerDefinitionEntry,
  { type: "metric" }
>;

export type ExpressionDefinitionEntry = Extract<
  MetricsViewerDefinitionEntry,
  { type: "expression" }
>;

export function isMetricEntry(
  entry: MetricsViewerDefinitionEntry,
): entry is MetricDefinitionEntry {
  return entry.type === "metric";
}

export function isExpressionEntry(
  entry: MetricsViewerDefinitionEntry,
): entry is ExpressionDefinitionEntry {
  return entry.type === "expression";
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
  label: string;
  display: MetricsViewerDisplayType;
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

export type SourceColorMap = Partial<
  Record<MetricSourceId | MetricExpressionId, string[]>
>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string | null;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};
