import type {
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  CubeDimensionKey,
  DimensionType,
} from "../types";

import {
  DEFAULT_DIMENSION_COUNT,
  DEFAULT_DIMENSION_TYPE_CAPS,
  DEFAULT_FILTER_DIMENSION_COUNT,
  DEFAULT_MEASURE_COUNT,
  MIN_DIMENSION_SCORE,
} from "./constants";
import { compareDimensions, rankMeasures } from "./ranking";

export function getDefaultSettings(catalog: CubeCatalog): CubeCoarseSettings {
  const measures = rankMeasures(catalog).slice(0, DEFAULT_MEASURE_COUNT);
  const isSupported = (dimension: CubeDimension) =>
    measures.some((measure) => measure.dimensionIds[dimension.key] != null);
  const eligible = catalog.dimensions
    .filter((d) => d.score >= MIN_DIMENSION_SCORE && isSupported(d))
    .sort(compareDimensions);

  return {
    measureIds: measures.map((measure) => measure.id),
    dimensionKeys: pickDimensionKeys(eligible),
    filterDimensionKeys: pickFilterDimensionKeys(eligible),
  };
}

/** Best-first, capped per type, up to DEFAULT_DIMENSION_COUNT. */
function pickDimensionKeys(eligible: CubeDimension[]): CubeDimensionKey[] {
  const countByType: Partial<Record<DimensionType, number>> = {};
  const dimensionKeys: CubeDimensionKey[] = [];
  for (const dimension of eligible) {
    if (dimensionKeys.length >= DEFAULT_DIMENSION_COUNT) {
      break;
    }
    const count = countByType[dimension.type] ?? 0;
    if (count < DEFAULT_DIMENSION_TYPE_CAPS[dimension.type]) {
      countByType[dimension.type] = count + 1;
      dimensionKeys.push(dimension.key);
    }
  }
  return dimensionKeys;
}

/** The best time dimension, then listable category/boolean dimensions. */
function pickFilterDimensionKeys(
  eligible: CubeDimension[],
): CubeDimensionKey[] {
  const bestTime = eligible.find((d) => d.type === "time");
  const listable = eligible.filter(
    (d) => (d.type === "category" || d.type === "boolean") && d.canListValues,
  );
  return [...(bestTime ? [bestTime] : []), ...listable]
    .slice(0, DEFAULT_FILTER_DIMENSION_COUNT)
    .map((d) => d.key);
}
