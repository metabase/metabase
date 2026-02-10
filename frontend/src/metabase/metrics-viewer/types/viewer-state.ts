import type { DatePickerValue } from "metabase/querying/common/types";
import type { MetricDefinition } from "metabase-lib/metric";
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

export type DefinitionId = MetricSourceId;

export interface MetricsViewerDefinitionEntry {
  id: DefinitionId;
  definition: MetricDefinition | null;
}

// ── Tab state ──

export interface MetricsViewerTabDefinitionConfig {
  definitionId: DefinitionId;
  projectionDimensionId?: string;
}

export interface MetricsViewerTabState {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  display: MetricsViewerDisplayType;
  definitions: MetricsViewerTabDefinitionConfig[];
  filter?: DatePickerValue;
  projectionTemporalUnit?: TemporalUnit;
  binningStrategy?: string | null;
}

// ── Page state ──

export interface MetricsViewerPageState {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  selectedTabId: string;
}

export function getInitialMetricsViewerPageState(): MetricsViewerPageState {
  return {
    definitions: [],
    tabs: [],
    selectedTabId: "",
  };
}

// ── Color mapping ──

export type SourceColorMap = Record<number, string>;

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string | null;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};
