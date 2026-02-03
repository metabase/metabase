import type * as Lib from "metabase-lib";
import type { DateFilterSpec } from "metabase-lib";
import type {
  Card,
  CardDisplayType,
  CardId,
  ConcreteTableId,
  Dataset,
  Measure,
  MeasureId,
  SingleSeries,
  Table,
  TemporalUnit,
} from "metabase-types/api";

/**
 * Display types supported in the metrics explorer.
 */
export type MetricsExplorerDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "row" | "pie"
>;

/**
 * Composite source ID format: "metric:{cardId}" or "measure:{measureId}"
 * This unifies handling while preserving type info and avoiding ID collisions.
 */
export type MetricSourceId = `metric:${number}` | `measure:${number}`;

/**
 * Dimension tab types for grouping metrics.
 */
export type DimensionTabType = "time" | "geo" | "category" | "boolean";

/**
 * Column info for a dimension tab, tracking which column from which source.
 */
export interface DimensionTabColumn {
  sourceId: MetricSourceId;
  column: Lib.ColumnMetadata;
  columnName: string;
}

/**
 * A dimension tab representing a groupable dimension across metrics.
 */
export interface DimensionTab {
  id: string; // "time" or column name
  type: DimensionTabType;
  label: string; // Display name
  columnsBySource: DimensionTabColumn[];
}

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

/**
 * Projection config for temporal unit and date filter.
 */
export interface ProjectionConfig {
  unit: TemporalUnit;
  filterSpec: DateFilterSpec | null;
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
 * Main state shape for the metrics-explorer RTK slice.
 */
export interface MetricsExplorerState {
  // Core state (persisted to URL)
  sourceOrder: MetricSourceId[];
  projectionConfig: ProjectionConfig | null;
  dimensionOverrides: DimensionOverrides;
  displayType: MetricsExplorerDisplayType;
  activeTabId: string; // "time" or column name, defaults to "time"

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
    unit: TemporalUnit;
    filterSpec?: DateFilterSpec;
  };
  dimensions?: Record<number, string>;
  display?: MetricsExplorerDisplayType;
  activeTab?: string;
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
  tableId: ConcreteTableId;
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
