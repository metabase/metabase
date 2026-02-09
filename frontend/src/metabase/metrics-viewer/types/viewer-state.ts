import type * as Lib from "metabase-lib";
import type {
  Card,
  CardDisplayType,
  ConcreteTableId,
  Measure,
  MeasureId,
  Table,
  TemporalUnit,
} from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";
import type { DatePickerValue } from "metabase/querying/common/types";

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
  columnsBySource: Record<MetricSourceId, string>;
}

// ── Definition types ──

export type TempJsMetricDefinition = {
  "source-metric"?: MetricId;
  "source-measure"?: MeasureId;

  _card?: Card;
  _measure?: Measure;
  _table?: Table;
  _query?: Lib.Query;
};

export function isMetricDefinition(
  def: TempJsMetricDefinition,
): def is TempJsMetricDefinition & { "source-metric": MetricId } {
  return "source-metric" in def && def["source-metric"] != null;
}

export function isMeasureDefinition(
  def: TempJsMetricDefinition,
): def is TempJsMetricDefinition & { "source-measure": MeasureId } {
  return "source-measure" in def && def["source-measure"] != null;
}

export type DefinitionId = MetricSourceId;

export interface MetricsViewerDefinitionEntry {
  id: DefinitionId;
  definition: TempJsMetricDefinition;
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

// ── Shared display types ──

export type SelectedMetric = {
  id: number;
  name: string;
  sourceType: "metric" | "measure";
  tableId?: ConcreteTableId;
  isLoading?: boolean;
};
