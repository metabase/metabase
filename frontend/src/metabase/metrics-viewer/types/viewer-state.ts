import type { DatePickerValue } from "metabase/querying/common/types";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import type {
  CardDisplayType,
  ConcreteTableId,
  TemporalUnit,
} from "metabase-types/api";

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
  dimensionsBySource: Record<MetricSourceId, string>;
}

// ── Definition types ──

export interface MetricsViewerDefinitionEntry {
  id: MetricSourceId;
  definition: MetricDefinition | null;
  breakoutDimension?: DimensionMetadata;
}

// ── Tab state ──

export interface MetricsViewerTabDefinitionConfig {
  definitionId: MetricSourceId;
  projectionDimensionId?: string;
  projectionDimension?: DimensionMetadata;
}

export interface MetricsViewerTabLayoutState {
  split: boolean;
  spacing: "comfortable" | "compact" | "custom";
  customSpacing: number;
}

export interface MetricsViewerTabState {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  display: MetricsViewerDisplayType;
  definitions: MetricsViewerTabDefinitionConfig[];
  filter?: DatePickerValue;
  projectionTemporalUnit?: TemporalUnit;
  binningStrategy: string | null;
  layout: MetricsViewerTabLayoutState;
}

export function getInitialMetricsViewerTabLayout(): MetricsViewerTabLayoutState {
  return {
    split: false,
    spacing: "comfortable",
    customSpacing: 2,
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
