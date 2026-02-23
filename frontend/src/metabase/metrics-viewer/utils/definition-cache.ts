import { createSelector, weakMapMemoize } from "@reduxjs/toolkit";

import * as LibMetric from "metabase-lib/metric";
import type { JsMetricDefinition } from "metabase-types/api";

import type { MetricsViewerTabProjectionConfig } from "../types/viewer-state";

import {
  applyBreakoutDimension,
  buildExecutableDefinition,
  findDimensionById,
} from "./metrics";

export const getModifiedDefinition = createSelector(
  (
    definition: LibMetric.MetricDefinition,
    _projectionDimensionId: string | undefined,
    _projection: MetricsViewerTabProjectionConfig,
  ) => definition,
  (
    _definition: LibMetric.MetricDefinition,
    projectionDimensionId: string | undefined,
    _projection: MetricsViewerTabProjectionConfig,
  ) => projectionDimensionId,
  (
    _definition: LibMetric.MetricDefinition,
    _projectionDimensionId: string | undefined,
    projection: MetricsViewerTabProjectionConfig,
  ) => projection,
  (
    definition,
    projectionDimensionId,
    projection,
  ): LibMetric.MetricDefinition | null => {
    const projections = LibMetric.projections(definition);
    const breakoutProjection = projections[0];

    let baseDefinition = definition;
    if (breakoutProjection) {
      baseDefinition = LibMetric.removeClause(definition, breakoutProjection);
    }

    const dimension = projectionDimensionId
      ? findDimensionById(baseDefinition, projectionDimensionId)
      : undefined;

    let executableDefinition = buildExecutableDefinition(
      baseDefinition,
      dimension,
      {
        projectionTemporalUnit: projection.temporalUnit,
        binningStrategy: projection.binningStrategy,
        dimensionFilter: projection.dimensionFilter,
      },
    );

    if (!executableDefinition) {
      return null;
    }

    if (breakoutProjection) {
      const breakoutDimensionMetadata = LibMetric.projectionDimension(
        definition,
        breakoutProjection,
      );
      const hasExplicitBucket =
        LibMetric.temporalBucket(breakoutProjection) !== null ||
        LibMetric.binning(breakoutProjection) !== null;
      const isRedundant =
        !hasExplicitBucket &&
        dimension &&
        breakoutDimensionMetadata &&
        LibMetric.isSameSource(dimension, breakoutDimensionMetadata);

      if (!isRedundant) {
        executableDefinition = applyBreakoutDimension(
          baseDefinition,
          executableDefinition,
          breakoutProjection,
        );
      }
    }

    return executableDefinition;
  },
  {
    memoize: weakMapMemoize,
    argsMemoize: weakMapMemoize,
  },
);

export const toJsDefinition = createSelector(
  (definition: LibMetric.MetricDefinition) => definition,
  (definition): JsMetricDefinition => {
    return LibMetric.toJsMetricDefinition(definition);
  },
  {
    memoize: weakMapMemoize,
    argsMemoize: weakMapMemoize,
  },
);

export const getBreakoutDefinition = createSelector(
  (definition: LibMetric.MetricDefinition) => definition,
  (definition): JsMetricDefinition => {
    return LibMetric.toJsMetricDefinition(definition);
  },
  {
    memoize: weakMapMemoize,
    argsMemoize: weakMapMemoize,
  },
);
