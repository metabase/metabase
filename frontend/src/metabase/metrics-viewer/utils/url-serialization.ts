import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import { getObjectEntries } from "metabase/utils/objects";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  MathOperator,
  SegmentId,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  ExpressionSubToken,
  MetricExpressionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
  MetricsViewerFormulaEntity,
  MetricsViewerPageState,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";
import {
  applyProjection,
  buildBinnedBreakoutDefinition,
} from "../utils/definition-builder";
import {
  buildDimensionFilterClause,
  extractDefinitionFilters,
} from "../utils/dimension-filters";

import { defineCompactSchema } from "./compact-schema";
import {
  getEffectiveDefinitionEntry,
  getEffectiveTokenDefinitionEntry,
  getEntryBreakout,
} from "./definition-entries";
import type { DimensionFilterValue } from "./dimension-filters";
import {
  findBinningStrategy,
  findDimensionById,
  findFilterDimensionById,
  findTemporalBucket,
} from "./dimension-lookup";
import { stampMetricCounts } from "./expression";

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

/**
 * When we deserialize an entity, we can't apply breakouts or filters until the definition has loaded.
 * So we store them and apply them lazily after the definition has loaded.
 */
export interface SerializedDefinitionInfo {
  breakout?: string;
  breakoutTemporalUnit?: TemporalUnit;
  breakoutBinning?: string;
  filters?: SerializedUrlFilter[];
  segments?: SegmentId[];
}

export function applySerializedDefinitionInfo(
  definition: MetricDefinition,
  {
    breakout,
    breakoutTemporalUnit,
    breakoutBinning,
    filters,
    segments,
  }: SerializedDefinitionInfo,
): MetricDefinition {
  let result = definition;

  if (breakout) {
    const dimension = findDimensionById(result, breakout);
    if (dimension) {
      const dimensionRef = LibMetric.dimensionReference(dimension);

      let modifiedRef: LibMetric.ProjectionClause | null = null;
      if (breakoutTemporalUnit) {
        const bucket = findTemporalBucket(
          result,
          dimension,
          breakoutTemporalUnit,
        );
        if (bucket) {
          modifiedRef = LibMetric.withTemporalBucket(dimensionRef, bucket);
        }
      } else if (breakoutBinning) {
        const strategy = findBinningStrategy(
          result,
          dimension,
          breakoutBinning,
        );
        if (strategy) {
          modifiedRef = LibMetric.withBinning(dimensionRef, strategy);
        }
      }

      result = modifiedRef
        ? applyProjection(result, modifiedRef)
        : buildBinnedBreakoutDefinition(result, dimensionRef);
    }
  }

  if (filters) {
    for (const filter of filters) {
      const dimension = findFilterDimensionById(result, filter.dimensionId);
      if (dimension) {
        const clause = buildDimensionFilterClause(dimension, filter.value);
        result = LibMetric.filter(result, clause);
      }
    }
  }

  if (segments?.length) {
    const availableById = new Map(
      LibMetric.availableSegments(result).map((segment) => [
        LibMetric.segmentMetadataId(segment),
        segment,
      ]),
    );
    for (const segmentId of segments) {
      const segment = availableById.get(segmentId);
      if (segment) {
        result = LibMetric.addSegmentFilter(result, segment);
      }
    }
  }

  return result;
}

// ── Serialized types (internal, URL-facing) ──

interface SerializedExpressionSubToken {
  type: "metric" | "constant" | "operator" | "open-paren" | "close-paren";
  sourceId?: string;
  op?: MathOperator;
  value?: number;
  filters?: SerializedUrlFilter[];
  segments?: SegmentId[];
}

interface SerializedExpressionEntry {
  type: "expression";
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
  segments?: SegmentId[];
}

type SerializedFormulaEntity = SerializedExpressionEntry | SerializedSource;

interface SerializedDimensionBreakoutDef {
  slotIndex: number;
  dimensionId?: string;
}

interface SerializedProjectionConfig {
  dimensionFilter?: DimensionFilterValue;
  temporalUnit?: TemporalUnit;
  binning?: string;
}

interface SerializedDimensionBreakout {
  id: string;
  type: MetricsViewerDimensionBreakoutType;
  label: string | null;
  display: MetricsViewerDisplayType;
  showColumnLabels?: boolean;
  visualizationSettings?: Partial<VisualizationSettings>;
  definitions: SerializedDimensionBreakoutDef[];
  projectionConfig?: SerializedProjectionConfig;
}

export interface SerializedMetricsViewerPageState {
  formulaEntities: SerializedFormulaEntity[];
  dimensionBreakouts: SerializedDimensionBreakout[];
  selectedDimensionBreakoutId: string | null;
  showColumnLabels?: boolean;
}

// ── Expression sub-token helpers ──

function serializeSubToken(
  token: ExpressionSubToken,
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): SerializedExpressionSubToken {
  if (token.type === "metric") {
    const effectiveEntry = getEffectiveTokenDefinitionEntry(token, definitions);
    if (!effectiveEntry.definition) {
      return { type: "metric", sourceId: token.sourceId };
    }
    const serializedSource = definitionToSource(effectiveEntry.definition);
    if (!serializedSource) {
      return { type: "metric", sourceId: token.sourceId };
    }
    const annotatedSource = annotateSource(serializedSource, effectiveEntry);
    return {
      type: "metric",
      sourceId: token.sourceId,
      filters: annotatedSource.filters,
      segments: annotatedSource.segments,
    };
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
    const hasInfo = token.filters || token.segments;
    return {
      type: "metric",
      sourceId: token.sourceId as MetricSourceId,
      occurrenceCount: 0,
      serializedDefinitionInfo: hasInfo
        ? {
            filters: token.filters,
            segments: token.segments,
          }
        : undefined,
    };
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

export function deserializeFormulaEntities(
  serializedState: SerializedMetricsViewerPageState,
): MetricsViewerFormulaEntity[] {
  const entities: MetricsViewerFormulaEntity[] = [];

  for (const entity of serializedState.formulaEntities) {
    if (entity.type === "metric" || entity.type === "measure") {
      const hasInfo = entity.breakout || entity.filters || entity.segments;
      entities.push({
        id:
          entity.type === "metric"
            ? `metric:${entity.id}`
            : `measure:${entity.id}`,
        type: "metric" as const,
        definition: null,
        serializedDefinitionInfo: hasInfo
          ? {
              breakout: entity.breakout,
              breakoutTemporalUnit: entity.breakoutTemporalUnit,
              breakoutBinning: entity.breakoutBinning,
              filters: entity.filters,
              segments: entity.segments,
            }
          : undefined,
      });
    }
    if (entity.type === "expression") {
      entities.push({
        id: entity.id as MetricExpressionId,
        type: "expression" as const,
        name: entity.name,
        tokens: stampMetricCounts(
          entity.tokens
            .map(deserializeSubToken)
            .filter((t): t is ExpressionSubToken => t !== null),
        ),
      });
    }
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

function dimensionBreakoutToSerializedDimensionBreakout(
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
): SerializedDimensionBreakout {
  const { dimensionFilter, temporalUnit, binningStrategy } =
    dimensionBreakout.projectionConfig;
  const hasProjectionConfig =
    dimensionFilter !== undefined ||
    temporalUnit !== undefined ||
    binningStrategy;

  return {
    id: dimensionBreakout.id,
    type: dimensionBreakout.type,
    label: dimensionBreakout.label,
    display: dimensionBreakout.display,
    ...(dimensionBreakout.visualizationSettings &&
    Object.keys(dimensionBreakout.visualizationSettings).length > 0
      ? { visualizationSettings: dimensionBreakout.visualizationSettings }
      : {}),
    definitions: getObjectEntries(dimensionBreakout.dimensionMapping).map(
      ([key, dimensionId]) => ({
        slotIndex: Number(key),
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

function getSerializableDimensionBreakouts(state: MetricsViewerPageState) {
  const selectedDimensionBreakout = state.dimensionBreakouts.find(
    (dimensionBreakout) =>
      dimensionBreakout.id === state.selectedDimensionBreakoutId,
  );

  if (!selectedDimensionBreakout) {
    return {
      dimensionBreakouts: [],
      selectedDimensionBreakoutId: null,
    };
  }

  return {
    dimensionBreakouts: [selectedDimensionBreakout],
    selectedDimensionBreakoutId: selectedDimensionBreakout.id,
  };
}

export function deserializeDimensionBreakout(
  serializedDimensionBreakout: SerializedDimensionBreakout,
): MetricsViewerDimensionBreakoutState {
  const dimensionMapping: Record<number, string | null> = {};
  for (const serializedDefinition of serializedDimensionBreakout.definitions) {
    dimensionMapping[serializedDefinition.slotIndex] =
      serializedDefinition.dimensionId ?? null;
  }
  return {
    id: serializedDimensionBreakout.id,
    type: serializedDimensionBreakout.type,
    label: serializedDimensionBreakout.label,
    display: serializedDimensionBreakout.display,
    ...(serializedDimensionBreakout.showColumnLabels === true
      ? { showColumnLabels: true }
      : {}),
    ...(serializedDimensionBreakout.visualizationSettings
      ? {
          visualizationSettings:
            serializedDimensionBreakout.visualizationSettings,
        }
      : {}),
    dimensionMapping,
    projectionConfig: {
      dimensionFilter:
        serializedDimensionBreakout.projectionConfig?.dimensionFilter,
      temporalUnit: serializedDimensionBreakout.projectionConfig?.temporalUnit,
      binningStrategy: serializedDimensionBreakout.projectionConfig?.binning,
    },
  };
}

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

  const segmentIds: SegmentId[] = [];
  for (const filterClause of LibMetric.filters(entry.definition)) {
    if (!LibMetric.isSegmentFilter(filterClause)) {
      continue;
    }
    const metadata = LibMetric.segmentMetadataForFilter(
      entry.definition,
      filterClause,
    );
    if (metadata) {
      segmentIds.push(LibMetric.segmentMetadataId(metadata));
    }
  }
  if (segmentIds.length > 0) {
    source.segments = segmentIds;
  }

  return source;
}

export function stateToSerializedState(
  state: MetricsViewerPageState,
): SerializedMetricsViewerPageState {
  const formulaEntities: SerializedFormulaEntity[] = [];
  const { dimensionBreakouts, selectedDimensionBreakoutId } =
    getSerializableDimensionBreakouts(state);

  for (const entity of state.formulaEntities) {
    if (isMetricEntry(entity)) {
      const effectiveEntry = getEffectiveDefinitionEntry(
        entity,
        state.definitions,
      );
      if (!effectiveEntry.definition) {
        continue;
      }
      const source = definitionToSource(effectiveEntry.definition);
      if (!source) {
        continue;
      }
      formulaEntities.push(annotateSource(source, effectiveEntry));
    } else if (isExpressionEntry(entity)) {
      formulaEntities.push({
        type: "expression",
        id: entity.id,
        name: entity.name,
        tokens: entity.tokens.map((token) =>
          serializeSubToken(token, state.definitions),
        ),
      });
    }
  }

  return {
    formulaEntities,
    dimensionBreakouts: dimensionBreakouts.map(
      dimensionBreakoutToSerializedDimensionBreakout,
    ),
    selectedDimensionBreakoutId,
    ...(state.showColumnLabels ? { showColumnLabels: true } : {}),
  };
}

// ── Compact schemas ──

const sourceFilterSchema = defineCompactSchema<SerializedUrlFilter>({
  dimensionId: "d",
  value: { key: "v" },
});

const expressionSubTokenSchema =
  defineCompactSchema<SerializedExpressionSubToken>({
    type: "t",
    sourceId: { key: "s", optional: true },
    op: { key: "o", optional: true },
    value: { key: "v", optional: true },
    filters: { key: "F", schema: sourceFilterSchema, optional: true },
    segments: { key: "S", optional: true },
  });

const formulaEntitySchema = defineCompactSchema<SerializedFormulaEntity>({
  type: "t",
  id: "i",
  breakout: { key: "b", optional: true },
  breakoutTemporalUnit: { key: "u", optional: true },
  breakoutBinning: { key: "B", optional: true },
  filters: { key: "F", schema: sourceFilterSchema, optional: true },
  segments: { key: "s", optional: true },
  name: { key: "n", optional: true },
  tokens: { key: "T", schema: expressionSubTokenSchema, optional: true },
});

const dimensionBreakoutDefSchema =
  defineCompactSchema<SerializedDimensionBreakoutDef>({
    slotIndex: "i",
    dimensionId: { key: "d", optional: true },
  });

const projectionConfigSchema = defineCompactSchema<SerializedProjectionConfig>({
  dimensionFilter: { key: "f", optional: true },
  temporalUnit: { key: "u", optional: true },
  binning: { key: "b", optional: true },
});

const dimensionBreakoutSchema =
  defineCompactSchema<SerializedDimensionBreakout>({
    id: "i",
    type: "t",
    label: { key: "l", default: null },
    display: { key: "d", default: "line" },
    showColumnLabels: { key: "c", optional: true },
    visualizationSettings: { key: "V", optional: true },
    definitions: {
      key: "D",
      schema: dimensionBreakoutDefSchema,
      default: [],
    },
    projectionConfig: {
      key: "p",
      schema: projectionConfigSchema,
      optional: true,
    },
  });

const rootSchema = defineCompactSchema<SerializedMetricsViewerPageState>({
  formulaEntities: { key: "f", schema: formulaEntitySchema, default: [] },
  dimensionBreakouts: {
    key: "t",
    schema: dimensionBreakoutSchema,
    default: [],
  },
  selectedDimensionBreakoutId: { key: "a", default: null },
  showColumnLabels: { key: "c", optional: true },
});

// ── Encode / decode ──

function emptyState(): SerializedMetricsViewerPageState {
  return {
    formulaEntities: [],
    dimensionBreakouts: [],
    selectedDimensionBreakoutId: null,
    showColumnLabels: false,
  };
}

// After JSON.parse, Date values are ISO strings. Walk the decoded state and revive them.
function reviveStateDates(
  state: SerializedMetricsViewerPageState,
): SerializedMetricsViewerPageState {
  return {
    ...state,
    formulaEntities: state.formulaEntities.map((entity) => {
      if ("filters" in entity && entity.filters) {
        return {
          ...entity,
          filters: entity.filters.map((filter) => ({
            ...filter,
            value: reviveFilter(filter.value),
          })),
        };
      }
      if ("tokens" in entity && entity.tokens) {
        return {
          ...entity,
          tokens: entity.tokens.map((token) => {
            if ("filters" in token && token.filters) {
              return {
                ...token,
                filters: token.filters.map((filter) => ({
                  ...filter,
                  value: reviveFilter(filter.value),
                })),
              };
            }
            return token;
          }),
        };
      }
      return entity;
    }),
    dimensionBreakouts: state.dimensionBreakouts.map((dimensionBreakout) =>
      dimensionBreakout.projectionConfig?.dimensionFilter
        ? {
            ...dimensionBreakout,
            projectionConfig: {
              ...dimensionBreakout.projectionConfig,
              dimensionFilter: reviveFilter(
                dimensionBreakout.projectionConfig.dimensionFilter,
              ),
            },
          }
        : dimensionBreakout,
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
