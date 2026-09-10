import { t } from "ttag";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutProjectionConfig,
  MetricsViewerDimensionBreakoutState,
} from "metabase/metrics-viewer/types";
import { buildBinnedBreakoutDefinition } from "metabase/metrics-viewer/utils/definition-builder";
import { buildDimensionFilterClause } from "metabase/metrics-viewer/utils/dimension-filters";
import {
  findDimensionById,
  findFilterDimensionById,
} from "metabase/metrics-viewer/utils/dimension-lookup";
import { createMeasureSourceId } from "metabase/metrics-viewer/utils/source-ids";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId, SegmentId } from "metabase-types/api";

import type {
  CubeCard,
  CubeCatalog,
  CubeFilters,
  CubeMeasure,
  CubeSegment,
  CubeSeries,
} from "../types";

export interface CardViewerModel {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricDefinitionEntry[];
  dimensionBreakout: MetricsViewerDimensionBreakoutState;
  /** Series labels keyed by entity index; overrides the definition names. */
  entityNames: Map<number, string>;
  /** Measures that lack the column of an active dimension filter. */
  unappliedFilterMeasureIds: MeasureId[];
}

/**
 * Shared across every card so `getModifiedDefinition`'s identity-keyed cache
 * hits: a fresh object per card would re-dispatch every query.
 */
export const EMPTY_PROJECTION_CONFIG: MetricsViewerDimensionBreakoutProjectionConfig =
  {};

interface CardToViewerModelParams {
  card: CubeCard;
  catalog: CubeCatalog;
  definitions: Map<MeasureId, MetricDefinition>;
  filters: CubeFilters;
}

interface ResolvedSeries {
  series: CubeSeries;
  measure: CubeMeasure;
  baseDefinition: MetricDefinition;
}

export function cardToViewerModel({
  card,
  catalog,
  definitions,
  filters,
}: CardToViewerModelParams): CardViewerModel | null {
  const measureById = new Map(catalog.measures.map((m) => [m.id, m]));
  const segmentById = new Map(catalog.segments.map((s) => [s.id, s]));

  const resolvedSeries: ResolvedSeries[] = [];
  for (const series of card.series) {
    const measure = measureById.get(series.measureId);
    const baseDefinition = definitions.get(series.measureId);
    if (!measure || !baseDefinition) {
      return null;
    }
    resolvedSeries.push({ series, measure, baseDefinition });
  }

  const [firstDimensionKey, secondDimensionKey] = card.dimensionKeys;
  const firstDimension = catalog.dimensions.find(
    (dimension) => dimension.key === firstDimensionKey,
  );

  const viewerDefinitions: Record<
    MetricSourceId,
    MetricsViewerDefinitionEntry
  > = {};
  const unappliedFilterMeasureIds = new Set<MeasureId>();
  const entityNames = new Map<number, string>();

  const formulaEntities = resolvedSeries.map(
    (
      { series, measure, baseDefinition },
      entityIndex,
    ): MetricDefinitionEntry => {
      const id = createMeasureSourceId(measure.id);
      viewerDefinitions[id] ??= { id, definition: baseDefinition };

      let definition = applySegments(
        baseDefinition,
        unique([...series.segmentIds, ...filters.segmentIds]),
      );

      const { definition: filtered, hasUnappliedFilter } =
        applyDimensionFilters(definition, measure, filters);
      definition = filtered;
      if (hasUnappliedFilter) {
        unappliedFilterMeasureIds.add(measure.id);
      }

      if (secondDimensionKey != null) {
        definition = applySeriesBreakout(
          definition,
          measure,
          secondDimensionKey,
        );
      }

      entityNames.set(
        entityIndex,
        getEntityName(card, measure, series, segmentById),
      );

      return { id, type: "metric", definition };
    },
  );

  const dimensionMapping =
    firstDimensionKey != null
      ? Object.fromEntries(
          resolvedSeries.map(({ measure }, slotIndex) => [
            slotIndex,
            measure.dimensionIds[firstDimensionKey] ?? null,
          ]),
        )
      : {};

  const dimensionBreakout: MetricsViewerDimensionBreakoutState = {
    id: card.id,
    type: firstDimension?.type ?? "scalar",
    label: null,
    display: card.display,
    dimensionMapping,
    projectionConfig: EMPTY_PROJECTION_CONFIG,
  };

  return {
    definitions: viewerDefinitions,
    formulaEntities,
    dimensionBreakout,
    entityNames,
    unappliedFilterMeasureIds: [...unappliedFilterMeasureIds],
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function applySegments(
  definition: MetricDefinition,
  segmentIds: SegmentId[],
): MetricDefinition {
  if (segmentIds.length === 0) {
    return definition;
  }
  const availableSegments = LibMetric.availableSegments(definition);
  return segmentIds.reduce((current, segmentId) => {
    const segment = availableSegments.find(
      (candidate) => LibMetric.segmentMetadataId(candidate) === segmentId,
    );
    return segment ? LibMetric.addSegmentFilter(current, segment) : current;
  }, definition);
}

function applyDimensionFilters(
  definition: MetricDefinition,
  measure: CubeMeasure,
  filters: CubeFilters,
): { definition: MetricDefinition; hasUnappliedFilter: boolean } {
  let hasUnappliedFilter = false;
  const filtered = filters.dimensionFilters.reduce((current, filter) => {
    const dimensionId = measure.dimensionIds[filter.dimensionKey];
    const dimension =
      dimensionId != null
        ? findFilterDimensionById(current, dimensionId)
        : undefined;
    if (!dimension) {
      hasUnappliedFilter = true;
      return current;
    }
    return LibMetric.filter(
      current,
      buildDimensionFilterClause(dimension, filter.value),
    );
  }, definition);
  return { definition: filtered, hasUnappliedFilter };
}

function applySeriesBreakout(
  definition: MetricDefinition,
  measure: CubeMeasure,
  dimensionKey: string,
): MetricDefinition {
  const dimensionId = measure.dimensionIds[dimensionKey];
  const breakout =
    dimensionId != null
      ? findDimensionById(definition, dimensionId)
      : undefined;
  if (!breakout) {
    return definition;
  }
  return buildBinnedBreakoutDefinition(
    definition,
    LibMetric.dimensionReference(breakout),
  );
}

function getEntityName(
  card: CubeCard,
  measure: CubeMeasure,
  series: CubeSeries,
  segmentById: Map<SegmentId, CubeSegment>,
): string {
  const segmentNames = series.segmentIds.flatMap((segmentId) => {
    const segment = segmentById.get(segmentId);
    return segment ? [segment.name] : [];
  });
  const isSegmented = segmentNames.length > 0;

  if (card.kind === "by-segment") {
    return isSegmented ? segmentNames.join(", ") : t`All`;
  }
  return isSegmented
    ? `${measure.name} (${segmentNames.join(", ")})`
    : measure.name;
}
