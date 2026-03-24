import type {
  DimensionMetadata,
  MeasureDisplayInfo,
  MetricDefinition,
  MetricDisplayInfo,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import { UNBINNED } from "../constants";

import type { DimensionFilterValue } from "./dimension-filters";
import { buildDimensionFilterClause } from "./dimension-filters";
import { findBinningStrategy, findTemporalBucket } from "./dimension-lookup";

// ── Projection application ──

function applyBinnedProjection(
  definition: MetricDefinition,
  dimension: DimensionMetadata,
  binningStrategy: string | undefined,
): MetricDefinition {
  const projections = LibMetric.projections(definition);

  let newProjection: ProjectionClause;

  const tempDef = LibMetric.project(
    projections.reduce<MetricDefinition>(
      (definition, projection) =>
        LibMetric.removeClause(definition, projection),
      definition,
    ),
    LibMetric.dimensionReference(dimension),
  );
  const tempProjections = LibMetric.projections(tempDef);
  if (tempProjections.length === 0) {
    return definition;
  }
  const baseProjection = tempProjections[tempProjections.length - 1];

  if (binningStrategy === UNBINNED) {
    newProjection = LibMetric.withBinning(baseProjection, null);
  } else if (binningStrategy) {
    const strategy = findBinningStrategy(
      definition,
      dimension,
      binningStrategy,
    );
    newProjection = LibMetric.withBinning(baseProjection, strategy);
  } else {
    newProjection = LibMetric.withDefaultBinning(tempDef, baseProjection);
  }

  return LibMetric.replaceClause(tempDef, baseProjection, newProjection);
}

export function applyProjection(
  definition: MetricDefinition,
  dimension: ProjectionClause,
): MetricDefinition {
  let result = definition;
  for (const proj of LibMetric.projections(definition)) {
    result = LibMetric.removeClause(result, proj);
  }

  return LibMetric.project(result, dimension);
}

function applyTemporalUnit(
  definition: MetricDefinition,
  unit: TemporalUnit,
): MetricDefinition {
  const projections = LibMetric.projections(definition);
  if (projections.length === 0) {
    return definition;
  }

  const projection = projections[0];
  const dimension = LibMetric.projectionDimension(definition, projection);
  if (!dimension || !LibMetric.isDateOrDateTime(dimension)) {
    return definition;
  }

  const bucket = findTemporalBucket(definition, dimension, unit);
  if (!bucket) {
    return definition;
  }

  const newProjection = LibMetric.withTemporalBucket(projection, bucket);
  return LibMetric.replaceClause(definition, projection, newProjection);
}

// ── Breakout application ──

export function buildBinnedBreakoutDefinition(
  baseDef: MetricDefinition,
  breakoutDimension: ProjectionClause,
): MetricDefinition {
  if (
    LibMetric.temporalBucket(breakoutDimension) ||
    LibMetric.binning(breakoutDimension)
  ) {
    return applyProjection(baseDef, breakoutDimension);
  }

  const definition = applyProjection(baseDef, breakoutDimension);
  const projections = LibMetric.projections(definition);
  if (projections.length === 0) {
    return definition;
  }

  const projection = projections[projections.length - 1];
  const dimension = LibMetric.projectionDimension(definition, projection);
  if (!dimension) {
    return definition;
  }

  if (LibMetric.isBinnable(definition, dimension)) {
    return LibMetric.replaceClause(
      definition,
      projection,
      LibMetric.withDefaultBinning(definition, projection),
    );
  }
  if (LibMetric.isTemporalBucketable(definition, dimension)) {
    return LibMetric.replaceClause(
      definition,
      projection,
      LibMetric.withDefaultTemporalBucket(definition, projection),
    );
  }
  return definition;
}

export function applyBreakoutDimension(
  baseDefinition: MetricDefinition,
  execDef: MetricDefinition,
  breakoutDimension: ProjectionClause,
): MetricDefinition {
  if (
    LibMetric.temporalBucket(breakoutDimension) ||
    LibMetric.binning(breakoutDimension)
  ) {
    return LibMetric.project(execDef, breakoutDimension);
  }

  const binnedDefinition = buildBinnedBreakoutDefinition(
    baseDefinition,
    breakoutDimension,
  );
  const binnedProjection = LibMetric.projections(binnedDefinition);
  if (binnedProjection.length === 0) {
    return LibMetric.project(execDef, breakoutDimension);
  }

  const binnedProj = binnedProjection[binnedProjection.length - 1];
  return LibMetric.project(execDef, binnedProj);
}

// ── Composite definition builder ──

type ProjectionOptions = {
  projectionTemporalUnit?: TemporalUnit;
  binningStrategy?: string;
  dimensionFilter?: DimensionFilterValue;
};

export function buildExecutableDefinition(
  baseDefinition: MetricDefinition,
  dimension: DimensionMetadata | undefined,
  options: ProjectionOptions,
): MetricDefinition | null {
  if (!dimension) {
    return null;
  }

  const { projectionTemporalUnit, binningStrategy, dimensionFilter } = options;
  const dimensionReference = LibMetric.dimensionReference(dimension);

  let definition = baseDefinition;

  if (LibMetric.isTemporalBucketable(baseDefinition, dimension)) {
    definition = applyProjection(definition, dimensionReference);

    if (projectionTemporalUnit) {
      definition = applyTemporalUnit(definition, projectionTemporalUnit);
    } else {
      const projections = LibMetric.projections(definition);
      if (projections.length > 0) {
        const defaultProj = LibMetric.withDefaultTemporalBucket(
          definition,
          projections[0],
        );
        definition = LibMetric.replaceClause(
          definition,
          projections[0],
          defaultProj,
        );
      }
    }
  } else if (LibMetric.isBinnable(baseDefinition, dimension)) {
    definition = applyBinnedProjection(definition, dimension, binningStrategy);
  } else {
    definition = applyProjection(definition, dimensionReference);
  }

  if (dimensionFilter) {
    const projections = LibMetric.projections(definition);
    if (projections.length > 0) {
      const projectionDimension = LibMetric.projectionDimension(
        definition,
        projections[0],
      );
      if (projectionDimension) {
        const filterClause = buildDimensionFilterClause(
          projectionDimension,
          dimensionFilter,
        );
        definition = LibMetric.filter(definition, filterClause);
      }
    }
  }

  return definition;
}

// ── Projection inspection ──

export type ProjectionInfo = {
  projection: ProjectionClause | undefined;
  projectionDimension: DimensionMetadata | undefined;
  filterDimension: DimensionMetadata | undefined;
  isTemporalBucketable: boolean;
  isBinnable: boolean;
  hasBinning: boolean;
};

export function getProjectionInfo(
  definition: MetricDefinition,
): ProjectionInfo {
  const allProjections = LibMetric.projections(definition);
  const firstProjection = allProjections[0];

  const projectionDimension = firstProjection
    ? (LibMetric.projectionDimension(definition, firstProjection) ?? undefined)
    : undefined;

  const isTemporalBucketable = projectionDimension
    ? LibMetric.isTemporalBucketable(definition, projectionDimension)
    : false;
  const isBinnable = projectionDimension
    ? LibMetric.isBinnable(definition, projectionDimension)
    : false;
  const hasBinning = firstProjection
    ? LibMetric.binning(firstProjection) !== null
    : false;

  let filterDimension: DimensionMetadata | undefined;

  if (projectionDimension) {
    const dimensionInfo = LibMetric.displayInfo(
      definition,
      projectionDimension,
    );
    const filterableDims = LibMetric.filterableDimensions(definition);
    filterDimension = filterableDims.find((candidate) => {
      const info = LibMetric.displayInfo(definition, candidate);
      return info.name === dimensionInfo.name;
    });
  }

  return {
    projection: firstProjection,
    projectionDimension: projectionDimension,
    filterDimension,
    isTemporalBucketable,
    isBinnable,
    hasBinning,
  };
}

// ── Definition display helpers ──

export function getDefinitionName(def: MetricDefinition): string | null {
  const meta = LibMetric.sourceMetricOrMeasureMetadata(def);
  return meta ? LibMetric.displayInfo(def, meta).displayName : null;
}

export function getDefinitionColumnName(def: MetricDefinition): string | null {
  const meta = LibMetric.sourceMetricOrMeasureMetadata(def);
  if (!meta) {
    return null;
  }
  const info = LibMetric.displayInfo(def, meta) as
    | MetricDisplayInfo
    | MeasureDisplayInfo;
  return info.columnName ?? null;
}
