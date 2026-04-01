import type { DimensionType } from "metabase/metrics/common/utils/dimension-types";
import type { MetricDefinition } from "metabase-lib/metric";
import type {
  CardDisplayType,
  ConcreteTableId,
  Dataset,
  DimensionId,
  MathOperator,
  TemporalUnit,
} from "metabase-types/api";

import type { DimensionFilterValue } from "../utils/dimension-filters";

// ── Core types ──

export type MetricsViewerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie" | "scatter" | "scalar"
>;

export type MetricSourceId = `metric:${number}` | `measure:${number}`;
export type MetricExpressionId = `expression:${string}`;

export type MetricsViewerTabType = DimensionType | "scalar";

export interface StoredMetricsViewerTab {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  dimensionsBySource: Record<number, DimensionId>;
}

// ── Expression sub-tokens ──

/**
 * Tokens that appear inside a single expression formula.
 * These are the building blocks of an expression definition entry.
 */
export type ExpressionSubToken =
  | {
      type: "metric";
      sourceId: MetricSourceId;
      count: number;
      definition?: MetricDefinition;
    }
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
export interface MetricsViewerDefinitionEntry {
  id: MetricSourceId;
  definition: MetricDefinition | null;
}

export type MetricDefinitionEntry = MetricsViewerDefinitionEntry & {
  type: "metric";
};

export type ExpressionDefinitionEntry = {
  id: MetricExpressionId;
  type: "expression";
  name: string;
  tokens: ExpressionSubToken[];
};

export type MetricsViewerFormulaEntity =
  | MetricDefinitionEntry
  | ExpressionDefinitionEntry;

export function isMetricEntry(
  entry: MetricsViewerFormulaEntity,
): entry is MetricDefinitionEntry {
  return entry.type === "metric";
}

export function isExpressionEntry(
  entry: MetricsViewerFormulaEntity,
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
  label: string | null;
  display: MetricsViewerDisplayType;
  dimensionMapping: Record<number, DimensionId | null>;
  projectionConfig: MetricsViewerTabProjectionConfig;
}

// ── Page state ──

export interface MetricsViewerPageState {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>; // pristine definitions for unique metrics used in formula
  formulaEntities: MetricsViewerFormulaEntity[]; // specific items used in formula, definitions there contains filters
  tabs: MetricsViewerTabState[]; // visualization settings for a tab
  selectedTabId: string | null;
}

export function getInitialMetricsViewerPageState(): MetricsViewerPageState {
  return {
    definitions: {},
    formulaEntities: [],
    tabs: [],
    selectedTabId: null,
  };
}

// ── Color mapping ──

/**
 * Maps each formula-entity index to its assigned colour(s).
 * Keyed by position in `formulaEntities[]` so that two instances of the same
 * metric get independent colour assignments.
 */
export type SourceColorMap = Record<number, string[]>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string | null;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};

/**
 * One entry per expression definition in the formulaEntities list.
 */
export type ExpressionItemResult = {
  /** The expression definition entry. */
  entry: ExpressionDefinitionEntry;
  /** Per-source modified definitions used by this expression. */
  modifiedDefinitions: Record<MetricSourceId, MetricDefinition>;
  result: Dataset | null;
  isExecuting: boolean;
  requestError: string | null; // error from http request
  expressionError: string | null; // error building the expression
};
