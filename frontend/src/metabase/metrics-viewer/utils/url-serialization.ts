import type {
  SerializedDefinitionInfo,
  SerializedDimensionBreakout,
  SerializedExpressionSubToken,
  SerializedFormulaEntity,
  SerializedMetricsViewerPageState,
  SerializedSource,
} from "metabase/common/metrics-viewer";
import { getObjectEntries } from "metabase/utils/objects";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { SegmentId } from "metabase-types/api";

import type {
  ExpressionSubToken,
  MetricExpressionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
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

import {
  getEffectiveDefinitionEntry,
  getEffectiveTokenDefinitionEntry,
  getEntryBreakout,
} from "./definition-entries";
import {
  findBinningStrategy,
  findDimensionById,
  findFilterDimensionById,
  findTemporalBucket,
} from "./dimension-lookup";
import { stampMetricCounts } from "./expression";

export { decodeState, encodeState } from "metabase/common/metrics-viewer";
export type {
  SerializedDefinitionInfo,
  SerializedMetricsViewerPageState,
} from "metabase/common/metrics-viewer";

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
