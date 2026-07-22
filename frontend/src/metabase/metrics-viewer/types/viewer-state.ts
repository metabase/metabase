import type { GeoSubtype } from "metabase/common/metrics/utils/dimension-types";
import type {
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
  SerializedDefinitionInfo,
} from "metabase/common/metrics-viewer";
import type {
  DimensionGroup,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import type {
  CardId,
  DimensionId,
  IconName,
  MathOperator,
  SingleSeries,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

import type { DimensionFilterValue } from "../utils/dimension-filters";
import type { MetricSlot } from "../utils/metric-slots";

export type {
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
} from "metabase/common/metrics-viewer";

// ── Core types ──

export type MetricSourceId = `metric:${number}` | `measure:${number}`;
export type MetricExpressionId = `expression:${string}`;

export interface StoredMetricsViewerDimensionBreakout {
  id: string;
  type: MetricsViewerDimensionBreakoutType;
  label: string;
  dimensionBySlotIndex: Record<number, DimensionId>;
}

// ── Expression sub-tokens ──

export type ExpressionMetricSubToken = {
  type: "metric";
  sourceId: MetricSourceId;
  occurrenceCount: number;
  definition?: MetricDefinition;
  serializedDefinitionInfo?: SerializedDefinitionInfo;
};

/**
 * Tokens that appear inside a single expression formula.
 * These are the building blocks of an expression definition entry.
 */
export type ExpressionSubToken =
  | ExpressionMetricSubToken
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
 * which adds the dimension breakout's dimension as an additional projection.
 */
export interface MetricsViewerDefinitionEntry {
  id: MetricSourceId;
  definition: MetricDefinition | null;
}

export type MetricDefinitionEntry = MetricsViewerDefinitionEntry & {
  type: "metric";
  serializedDefinitionInfo?: SerializedDefinitionInfo;
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

// ── Dimension breakout state ──

export interface MetricsViewerDimensionBreakoutProjectionConfig {
  temporalUnit?: TemporalUnit;
  binningStrategy?: string;
  dimensionFilter?: DimensionFilterValue;
}

export interface MetricsViewerDimensionBreakoutState {
  id: string;
  type: MetricsViewerDimensionBreakoutType;
  label: string | null;
  display: MetricsViewerDisplayType;
  visualizationSettings?: Partial<VisualizationSettings>;
  dimensionMapping: Record<number, DimensionId | null>;
  projectionConfig: MetricsViewerDimensionBreakoutProjectionConfig;
}

export interface DimensionBreakoutInfo {
  id?: string;
  type: MetricsViewerDimensionBreakoutType;
  label: string;
  dimensionMapping: Record<number, string | null>;
}

export interface AvailableDimension {
  icon: IconName;
  group?: DimensionGroup;
  canListValues?: boolean;
  isPreferred?: boolean;
  geoSubtype?: GeoSubtype | null;
  dimensionBreakoutInfo: DimensionBreakoutInfo;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

// ── Page state ──

export interface MetricsViewerPageState {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>; // pristine definitions for unique metrics used in formula
  formulaEntities: MetricsViewerFormulaEntity[]; // specific items used in formula, definitions there contains filters
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[]; // visualization settings for a dimension breakout
  selectedDimensionBreakoutId: string | null;
  showColumnLabels: boolean;
}

export function getInitialMetricsViewerPageState(): MetricsViewerPageState {
  return {
    definitions: {},
    formulaEntities: [],
    dimensionBreakouts: [],
    selectedDimensionBreakoutId: null,
    showColumnLabels: false,
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
export type SourceBreakoutColorMap = Record<
  number,
  BreakoutColorMap | string | undefined
>;

/**
 * For consumers that expect an array of colors and don't care about breakout values.
 */
export type SourceColorMap = Record<number, string[]>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string | null;
  sourceType: "metric" | "measure";
  isLoading?: boolean;
};

export interface SourceDisplayInfo {
  type: "metric" | "measure";
  name: string;
}

export interface UseViewerStateResult {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState | null;
  initialLoadComplete: boolean;
  queriesAreLoading: boolean;
  queriesError: string | null;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  metricSlots: MetricSlot[];
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  activeBreakoutColors: SourceBreakoutColorMap;
  sourceColors: SourceColorMap;
  selectedMetrics: SelectedMetric[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  availableDimensions: AvailableDimensionsResult;
  sidebarAvailableDimensions: AvailableDimensionsResult;
  showColumnLabels: boolean;
  isSidebarOpen: boolean;
  closeSidebar: () => void;
  openSidebar: () => void;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number, sourceType: "metric" | "measure") => void;
  selectDimensionBreakout: (
    dimensionBreakoutInfo: DimensionBreakoutInfo,
    options?: { updateExisting?: boolean },
  ) => void;
  updateActiveDimensionBreakout: (
    setterFn: (
      prev: MetricsViewerDimensionBreakoutState,
    ) => MetricsViewerDimensionBreakoutState,
  ) => void;
  setShowColumnLabels: (showColumnLabels: boolean) => void;
  setBreakoutDimension: (
    entity: MetricDefinitionEntry,
    dimension: ProjectionClause | undefined,
  ) => void;
  setFormulaEntities: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
}
