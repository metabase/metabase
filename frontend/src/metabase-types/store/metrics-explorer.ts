import type * as Lib from "metabase-lib";
import type {
  ExcludeDateFilterParts,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
} from "metabase-lib";
import type {
  Card,
  CardDisplayType,
  CardId,
  ConcreteTableId,
  Dataset,
  Measure,
  MeasureId,
  Table,
  TemporalUnit,
} from "metabase-types/api";

/**
 * Display types supported in the metrics explorer.
 */
export type MetricsExplorerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie" | "scatter"
>;

/**
 * Composite source ID format: "metric:{cardId}" or "measure:{measureId}"
 * This unifies handling while preserving type info and avoiding ID collisions.
 */
export type MetricSourceId = `metric:${number}` | `measure:${number}`;

/**
 * Dimension tab types for grouping metrics.
 */
export type DimensionTabType = "time" | "geo" | "category" | "boolean" | "numeric";

/**
 * Column info for a dimension tab, tracking which column from which source.
 * This is the hydrated version with actual column metadata.
 */
export interface DimensionTabColumn {
  sourceId: MetricSourceId;
  column: Lib.ColumnMetadata;
  columnName: string;
}

/**
 * A stored dimension tab - the source of truth in Redux state.
 * Uses column names instead of column metadata for serializability.
 */
export interface StoredDimensionTab {
  id: string;
  type: DimensionTabType;
  label: string;
  columnsBySource: Record<MetricSourceId, string>;
  projectionConfig?: ProjectionConfig;
  displayType?: MetricsExplorerDisplayType;
}

/**
 * A hydrated dimension tab with resolved column metadata.
 * Used for rendering and query building.
 */
export interface DimensionTab {
  id: string;
  type: DimensionTabType;
  label: string;
  columnsBySource: DimensionTabColumn[];
  projectionConfig?: ProjectionConfig;
  displayType?: MetricsExplorerDisplayType;
}

export const TAB_KEY_MAP = {
  id: "i",
  type: "t",
  label: "l",
  columnsBySource: "c",
  projectionConfig: "p",
  displayType: "d",
} as const satisfies Record<keyof StoredDimensionTab, string>;

type SerializedProjection = {
  t?: "temporal" | "numeric";
  u?: TemporalUnit;
  f?: DateFilterSpec;
  b?: string | null;
};

type SerializedValueOverrides = {
  columnsBySource: Record<number, string>;
  projectionConfig: SerializedProjection;
};

export type SerializedTab = {
  [K in keyof StoredDimensionTab as (typeof TAB_KEY_MAP)[K]]: K extends keyof SerializedValueOverrides
    ? SerializedValueOverrides[K]
    : StoredDimensionTab[K];
};

/**
 * Data for a metric source (saved metric card).
 */
export interface MetricData {
  card: Card;
  dataset: Dataset;
}

/**
 * Data for a measure source.
 */
export interface MeasureData {
  measure: Measure;
  table: Table;
}

/**
 * Union type for source data - either metric or measure data.
 */
export type SourceData =
  | { type: "metric"; data: MetricData }
  | { type: "measure"; data: MeasureData; tableId: ConcreteTableId };

// Filter configuration without the column property (column is determined from query breakout)
export type RelativeDateFilterSpec = Omit<RelativeDateFilterParts, "column">;
export type SpecificDateFilterSpec = Omit<SpecificDateFilterParts, "column">;
export type ExcludeDateFilterSpec = Omit<ExcludeDateFilterParts, "column">;

export type DateFilterSpec =
  | RelativeDateFilterSpec
  | SpecificDateFilterSpec
  | ExcludeDateFilterSpec;

export function isRelativeDateFilterSpec(
  spec: DateFilterSpec,
): spec is RelativeDateFilterSpec {
  return "value" in spec && !("operator" in spec);
}

export function isSpecificDateFilterSpec(
  spec: DateFilterSpec,
): spec is SpecificDateFilterSpec {
  return "hasTime" in spec;
}

export function isExcludeDateFilterSpec(
  spec: DateFilterSpec,
): spec is ExcludeDateFilterSpec {
  return "operator" in spec && "values" in spec && !("hasTime" in spec);
}

/**
 * Projection config for temporal dimensions (time series).
 */
export interface TemporalProjectionConfig {
  type: "temporal";
  unit: TemporalUnit;
  filterSpec: DateFilterSpec | null;
}

/**
 * Projection config for numeric dimensions (binned).
 * binningStrategy values:
 * - null: Use default binning (Auto bin)
 * - UNBINNED constant: No binning
 * - string: Specific strategy name (e.g., "10 bins")
 */
export interface NumericProjectionConfig {
  type: "numeric";
  binningStrategy: string | null;
}

/**
 * Union type for projection configs.
 * Use type guards to narrow the type.
 */
export type ProjectionConfig = TemporalProjectionConfig | NumericProjectionConfig;

/**
 * Type guard for temporal projection config.
 */
export function isTemporalProjectionConfig(
  config: ProjectionConfig,
): config is TemporalProjectionConfig {
  return config.type === "temporal";
}

/**
 * Type guard for numeric projection config.
 */
export function isNumericProjectionConfig(
  config: ProjectionConfig,
): config is NumericProjectionConfig {
  return config.type === "numeric";
}

/**
 * Create a temporal projection config.
 */
export function createTemporalProjectionConfig(
  unit: TemporalUnit,
  filterSpec: DateFilterSpec | null = null,
): TemporalProjectionConfig {
  return { type: "temporal", unit, filterSpec };
}

/**
 * Create a numeric projection config.
 */
export function createNumericProjectionConfig(
  binningStrategy: string | null = null,
): NumericProjectionConfig {
  return { type: "numeric", binningStrategy };
}

/**
 * Dimension overrides mapping source IDs to column names.
 */
export type DimensionOverrides = Record<MetricSourceId, string>;

/**
 * Loading state for a specific source.
 */
export interface SourceLoadingState {
  sourceId: MetricSourceId;
  isLoading: boolean;
}

/**
 * Binning configuration for numeric dimensions.
 * Stores the binning strategy name (e.g., "Auto binned", "10 bins") or null for unbinned.
 */
export type BinningConfig = Record<string, string | null>; // tabId -> binning strategy name

/**
 * Main state shape for the metrics-explorer RTK slice.
 */
export interface MetricsExplorerState {
  // Core state (persisted to URL)
  sourceOrder: MetricSourceId[];
  projectionConfig: ProjectionConfig | null;
  dimensionOverrides: DimensionOverrides;
  displayType: MetricsExplorerDisplayType;
  activeTabId: string;
  dimensionTabs: StoredDimensionTab[];
  binningByTab: BinningConfig;

  // Data cache (not persisted to URL)
  sourceDataById: Record<MetricSourceId, SourceData>;
  resultsById: Record<MetricSourceId, Dataset>;

  // Loading/error states (using Records for O(1) lookups)
  loadingSourceIds: Record<MetricSourceId, boolean>;
  loadingResultIds: Record<MetricSourceId, boolean>;
  error: string | null;
}

/**
 * Serialized source format for URL encoding.
 */
export type SerializedSource =
  | { type: "metric"; id: number }
  | { type: "measure"; id: number; tableId: number };

/**
 * URL-serializable state shape.
 */
export interface SerializedExplorerState {
  sources: SerializedSource[];
  projection?: {
    type?: "temporal" | "numeric";
    unit?: TemporalUnit;
    filterSpec?: DateFilterSpec;
    binningStrategy?: string | null;
  };
  dimensions?: Record<number, string>;
  display?: MetricsExplorerDisplayType;
  activeTab?: string;
  tabs?: SerializedTab[];
}

/**
 * Selected metric display info for the search input.
 * Uses discriminated union to distinguish metrics from measures.
 * For measures, tableId may be undefined while data is loading.
 */
export type SelectedMetricInfo =
  | {
      sourceType: "metric";
      id: number;
      sourceId: MetricSourceId;
      name: string;
      isLoading: boolean;
    }
  | {
      sourceType: "measure";
      id: number;
      sourceId: MetricSourceId;
      name: string;
      tableId: ConcreteTableId | undefined;
      isLoading: boolean;
    };

/**
 * Payload for adding a metric source.
 */
export interface AddMetricSourcePayload {
  cardId: CardId;
}

/**
 * Payload for adding a measure source.
 */
export interface AddMeasureSourcePayload {
  measureId: MeasureId;
}

/**
 * Payload for initializing from URL state.
 */
export interface InitializeFromUrlPayload {
  sourceOrder: MetricSourceId[];
  projectionConfig: ProjectionConfig | null;
  dimensionOverrides: DimensionOverrides;
  displayType: MetricsExplorerDisplayType;
  activeTabId: string;
  dimensionTabs: StoredDimensionTab[];
  binningByTab: BinningConfig;
}

/**
 * Payload for setting binning strategy for a tab.
 */
export interface SetBinningPayload {
  tabId: string;
  binningStrategy: string | null;
}

/**
 * Payload for setting projection config.
 */
export interface SetProjectionConfigPayload {
  config: ProjectionConfig;
}

/**
 * Payload for setting a dimension override.
 */
export interface SetDimensionOverridePayload {
  sourceId: MetricSourceId;
  columnName: string;
}

/**
 * Payload for removing a source.
 */
export interface RemoveSourcePayload {
  sourceId: MetricSourceId;
}

/**
 * Payload for reordering sources.
 */
export interface ReorderSourcesPayload {
  sourceIds: MetricSourceId[];
}

/**
 * Payload for clearing a dimension override.
 */
export interface ClearDimensionOverridePayload {
  sourceId: MetricSourceId;
}

/**
 * Payload for swapping a source in place (preserving position).
 */
export interface SwapSourcePayload {
  oldSourceId: MetricSourceId;
  newSourceId: MetricSourceId;
}

/**
 * Payload for setting source data (internal).
 */
export interface SetSourceDataPayload {
  sourceId: MetricSourceId;
  data: SourceData;
}

/**
 * Payload for setting query result (internal).
 */
export interface SetResultPayload {
  sourceId: MetricSourceId;
  dataset: Dataset;
}
