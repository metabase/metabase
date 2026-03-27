import { b64url_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { getObjectEntries } from "metabase/lib/objects";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDisplayType,
  MetricsViewerPageState,
  MetricsViewerTabState,
  MetricsViewerTabType,
} from "../types/viewer-state";

import { defineCompactSchema } from "./compact-schema";
import { getEntryBreakout } from "./definition-entries";
import type { DimensionFilterValue } from "./dimension-filters";
import { extractDefinitionFilters } from "./dimension-filters";

function reviveFilter(filter: DimensionFilterValue): DimensionFilterValue {
  if (filter.type === "specific-date" || filter.type === "time") {
    return {
      ...filter,
      values: filter.values.map((value) =>
        typeof value === "string" ? new Date(value) : value,
      ),
    };
  } else if (filter.type === "number" || filter.type === "coordinate") {
    return {
      ...filter,
      values: filter.values.map((value) =>
        typeof value === "string" ? BigInt(value) : value,
      ),
    };
  }
  return filter;
}

// ── Serialized types (internal, URL-facing) ──

interface SerializedUrlFilter {
  dimensionId: string;
  value: DimensionFilterValue;
}

interface SerializedSource {
  type: "metric" | "measure";
  id: number;
  breakout?: string;
  breakoutTemporalUnit?: TemporalUnit;
  breakoutBinning?: string;
  filters?: SerializedUrlFilter[];
}

interface SerializedTabDef {
  definitionId: MetricSourceId;
  dimensionId?: string;
}

interface SerializedProjectionConfig {
  dimensionFilter?: DimensionFilterValue;
  temporalUnit?: TemporalUnit;
  binning?: string;
}

interface SerializedTab {
  id: string;
  type: MetricsViewerTabType;
  label: string | null;
  display: MetricsViewerDisplayType;
  definitions: SerializedTabDef[];
  projectionConfig?: SerializedProjectionConfig;
}

export interface SerializedMetricsViewerPageState {
  sources: SerializedSource[];
  tabs: SerializedTab[];
  selectedTabId: string | null;
}

// ── Conversion functions ──

function definitionToSource(def: MetricDefinition): SerializedSource | null {
  const metricId = LibMetric.sourceMetricId(def);
  if (metricId != null) {
    return { type: "metric", id: metricId };
  }
  const measureId = LibMetric.sourceMeasureId(def);
  if (measureId != null) {
    return { type: "measure", id: measureId };
  }
  return null;
}

function tabToSerializedTab(tab: MetricsViewerTabState): SerializedTab {
  const { dimensionFilter, temporalUnit, binningStrategy } =
    tab.projectionConfig;
  const hasProjectionConfig =
    dimensionFilter !== undefined ||
    temporalUnit !== undefined ||
    binningStrategy;

  return {
    id: tab.id,
    type: tab.type,
    label: tab.label,
    display: tab.display,
    definitions: getObjectEntries(tab.dimensionMapping).map(
      ([sourceId, dimensionId]) => ({
        definitionId: sourceId,
        ...(dimensionId != null ? { dimensionId } : {}),
      }),
    ),
    projectionConfig: hasProjectionConfig
      ? {
          dimensionFilter,
          temporalUnit,
          binning: binningStrategy,
        }
      : undefined,
  };
}

export function deserializeTab(
  serializedTab: SerializedTab,
): MetricsViewerTabState {
  const dimensionMapping: Record<MetricSourceId, string | null> = {};
  for (const serializedDefinition of serializedTab.definitions) {
    dimensionMapping[serializedDefinition.definitionId] =
      serializedDefinition.dimensionId ?? null;
  }
  return {
    id: serializedTab.id,
    type: serializedTab.type,
    label: serializedTab.label,
    display: serializedTab.display,
    dimensionMapping,
    projectionConfig: {
      dimensionFilter: serializedTab.projectionConfig?.dimensionFilter,
      temporalUnit: serializedTab.projectionConfig?.temporalUnit,
      binningStrategy: serializedTab.projectionConfig?.binning,
    },
  };
}

export function stateToSerializedState(
  state: MetricsViewerPageState,
): SerializedMetricsViewerPageState {
  return {
    sources: state.definitions.flatMap((entry) => {
      if (!entry.definition) {
        return [];
      }
      const source = definitionToSource(entry.definition);
      if (!source) {
        return [];
      }
      const breakoutProjection = getEntryBreakout(entry);
      if (breakoutProjection) {
        const rawDim = LibMetric.projectionDimension(
          entry.definition,
          breakoutProjection,
        );
        if (rawDim) {
          const dimInfo = LibMetric.dimensionValuesInfo(
            entry.definition,
            rawDim,
          );
          source.breakout = dimInfo.id;

          if (LibMetric.temporalBucket(breakoutProjection)) {
            const buckets = LibMetric.availableTemporalBuckets(
              entry.definition,
              rawDim,
            );
            for (const bucket of buckets) {
              const info = LibMetric.displayInfo(entry.definition, bucket);
              if (info.selected) {
                source.breakoutTemporalUnit = info.shortName;
                break;
              }
            }
          }

          if (LibMetric.binning(breakoutProjection)) {
            const strategies = LibMetric.availableBinningStrategies(
              entry.definition,
              rawDim,
            );
            for (const strategy of strategies) {
              const info = LibMetric.displayInfo(entry.definition, strategy);
              if (info.selected) {
                source.breakoutBinning = info.displayName;
                break;
              }
            }
          }
        }
      }

      const definitionFilters = extractDefinitionFilters(entry.definition);
      if (definitionFilters.length > 0) {
        source.filters = definitionFilters.map((filter) => ({
          dimensionId: filter.dimensionId,
          value: filter.value,
        }));
      }

      return [source];
    }),
    tabs: state.tabs.map(tabToSerializedTab),
    selectedTabId: state.selectedTabId,
  };
}

// ── Compact schemas ──

const sourceFilterSchema = defineCompactSchema<SerializedUrlFilter>({
  dimensionId: "d",
  value: { key: "v" },
});

const sourceSchema = defineCompactSchema<SerializedSource>({
  type: "t",
  id: "i",
  breakout: { key: "b", optional: true },
  breakoutTemporalUnit: { key: "u", optional: true },
  breakoutBinning: { key: "B", optional: true },
  filters: { key: "F", schema: sourceFilterSchema, optional: true },
});

const tabDefSchema = defineCompactSchema<SerializedTabDef>({
  definitionId: "i",
  dimensionId: { key: "d", optional: true },
});

const projectionConfigSchema = defineCompactSchema<SerializedProjectionConfig>({
  dimensionFilter: { key: "f", optional: true },
  temporalUnit: { key: "u", optional: true },
  binning: { key: "b", optional: true },
});

const tabSchema = defineCompactSchema<SerializedTab>({
  id: "i",
  type: "t",
  label: { key: "l", default: null },
  display: { key: "d", default: "line" },
  definitions: { key: "D", schema: tabDefSchema, default: [] },
  projectionConfig: {
    key: "p",
    schema: projectionConfigSchema,
    optional: true,
  },
});

const rootSchema = defineCompactSchema<SerializedMetricsViewerPageState>({
  sources: { key: "s", schema: sourceSchema, default: [] },
  tabs: { key: "t", schema: tabSchema, default: [] },
  selectedTabId: { key: "a", default: null },
});

// ── Encode / decode ──

function emptyState(): SerializedMetricsViewerPageState {
  return { sources: [], tabs: [], selectedTabId: null };
}

// After JSON.parse, Date values are ISO strings. Walk the decoded state and revive them.
function reviveStateDates(
  state: SerializedMetricsViewerPageState,
): SerializedMetricsViewerPageState {
  return {
    ...state,
    sources: state.sources.map((source) =>
      source.filters
        ? {
            ...source,
            filters: source.filters.map((filter) => ({
              ...filter,
              value: reviveFilter(filter.value),
            })),
          }
        : source,
    ),
    tabs: state.tabs.map((tab) =>
      tab.projectionConfig?.dimensionFilter
        ? {
            ...tab,
            projectionConfig: {
              ...tab.projectionConfig,
              dimensionFilter: reviveFilter(
                tab.projectionConfig.dimensionFilter,
              ),
            },
          }
        : tab,
    ),
  };
}

export function encodeState(
  state: SerializedMetricsViewerPageState,
): string | undefined {
  try {
    return utf8_to_b64url(
      JSON.stringify(rootSchema.compact(state), (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    );
  } catch (err) {
    console.error("Failed to encode metrics viewer URL state:", err);
    return undefined;
  }
}

export function decodeState(hash: string): SerializedMetricsViewerPageState {
  if (!hash) {
    return emptyState();
  }

  try {
    const state =
      rootSchema.expand(JSON.parse(b64url_to_utf8(hash))) ?? emptyState();
    return reviveStateDates(state);
  } catch (err) {
    console.warn("Failed to decode metrics viewer URL state:", err);
    return emptyState();
  }
}
