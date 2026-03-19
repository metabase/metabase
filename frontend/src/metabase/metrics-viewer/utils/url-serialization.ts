import { b64url_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { getObjectEntries } from "metabase/lib/objects";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import type { MathOperator } from "../types/operators";
import type {
  ExpressionSubToken,
  MetricExpressionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
  MetricsViewerTabState,
  MetricsViewerTabType,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";

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

interface SerializedExpressionSubToken {
  type: "metric" | "constant" | "operator" | "open-paren" | "close-paren";
  sourceId?: string;
  op?: MathOperator;
  value?: number;
}

interface SerializedExpressionEntry {
  id: string;
  name: string;
  tokens: SerializedExpressionSubToken[];
}

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
  label: string;
  display: MetricsViewerDisplayType;
  definitions: SerializedTabDef[];
  projectionConfig?: SerializedProjectionConfig;
}

export interface SerializedMetricsViewerPageState {
  sources: SerializedSource[];
  tabs: SerializedTab[];
  selectedTabId: string | null;
  expressions: SerializedExpressionEntry[];
}

// ── Expression sub-token helpers ──

function serializeSubToken(
  token: ExpressionSubToken,
): SerializedExpressionSubToken {
  if (token.type === "metric") {
    return { type: "metric", sourceId: token.sourceId };
  }
  if (token.type === "constant") {
    return { type: "constant", value: token.value };
  }
  if (token.type === "operator") {
    return { type: "operator", op: token.op };
  }
  return { type: token.type };
}

function deserializeSubToken(
  token: SerializedExpressionSubToken,
): ExpressionSubToken | null {
  if (token.type === "metric" && token.sourceId) {
    return { type: "metric", sourceId: token.sourceId as MetricSourceId };
  }
  if (token.type === "constant" && token.value !== undefined) {
    return { type: "constant", value: token.value };
  }
  if (token.type === "operator" && token.op) {
    return { type: "operator", op: token.op };
  }
  if (token.type === "open-paren") {
    return { type: "open-paren" };
  }
  if (token.type === "close-paren") {
    return { type: "close-paren" };
  }
  return null;
}

/**
 * Reconstructs the full `MetricsViewerFormulaEntity[]` from both `sources`
 * (as metric formula entities) and `expressions` in the serialized state.
 * Sources become metric-type formula entities; expressions become expression-type.
 */
export function deserializeFormulaEntities(
  serializedState: SerializedMetricsViewerPageState,
): MetricsViewerFormulaEntity[] {
  const entities: MetricsViewerFormulaEntity[] = [];

  // Metric sources become metric formula entities
  for (const source of serializedState.sources) {
    const sourceId: MetricSourceId =
      source.type === "metric" ? `metric:${source.id}` : `measure:${source.id}`;
    entities.push({
      id: sourceId,
      type: "metric" as const,
      definition: null,
    });
  }

  // Expression entries become expression formula entities
  for (const entry of serializedState.expressions) {
    entities.push({
      id: entry.id as MetricExpressionId,
      type: "expression" as const,
      name: entry.name,
      tokens: entry.tokens
        .map(deserializeSubToken)
        .filter((t): t is ExpressionSubToken => t !== null),
    });
  }

  return entities;
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

/**
 * Annotates a source with breakout/filter data from the definitions map.
 */
function annotateSource(
  source: SerializedSource,
  entry: MetricsViewerDefinitionEntry,
): SerializedSource {
  if (!entry.definition) {
    return source;
  }

  const breakoutProjection = getEntryBreakout(entry);
  if (breakoutProjection) {
    const rawDim = LibMetric.projectionDimension(
      entry.definition,
      breakoutProjection,
    );
    if (rawDim) {
      const dimInfo = LibMetric.dimensionValuesInfo(entry.definition, rawDim);
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

  return source;
}

export function stateToSerializedState(
  state: MetricsViewerPageState,
): SerializedMetricsViewerPageState {
  const sources: SerializedSource[] = [];
  const expressions: SerializedExpressionEntry[] = [];

  // Iterate formulaEntities to build sources and expressions
  for (const entity of state.formulaEntities) {
    if (isMetricEntry(entity)) {
      const entry = state.definitions[entity.id];
      if (!entry?.definition) {
        continue;
      }
      const source = definitionToSource(entry.definition);
      if (!source) {
        continue;
      }
      sources.push(annotateSource(source, entry));
    } else if (isExpressionEntry(entity)) {
      expressions.push({
        id: entity.id,
        name: entity.name,
        tokens: entity.tokens.map(serializeSubToken),
      });
    }
  }

  return {
    sources,
    expressions,
    tabs: state.tabs.map(tabToSerializedTab),
    selectedTabId: state.selectedTabId,
  };
}

// ── Compact schemas ──

const expressionSubTokenSchema =
  defineCompactSchema<SerializedExpressionSubToken>({
    type: "t",
    sourceId: { key: "s", optional: true },
    op: { key: "o", optional: true },
    value: { key: "v", optional: true },
  });

const expressionEntrySchema = defineCompactSchema<SerializedExpressionEntry>({
  id: "i",
  name: "n",
  tokens: { key: "t", schema: expressionSubTokenSchema, default: [] },
});

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
  label: { key: "l", default: "" },
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
  expressions: { key: "x", schema: expressionEntrySchema, default: [] },
});

// ── Encode / decode ──

function emptyState(): SerializedMetricsViewerPageState {
  return { sources: [], tabs: [], selectedTabId: null, expressions: [] };
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
