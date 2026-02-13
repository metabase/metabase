import { getDateFilterClause } from "metabase/metrics/utils/dates";
import type { DatePickerValue } from "metabase/querying/common/types";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import { UNBINNED } from "../constants";
import type { MetricsViewerTabState } from "../types/viewer-state";

// ── Dimension classification ──

export function isGeoDimension(dim: DimensionMetadata): boolean {
  if (
    LibMetric.isCoordinate(dim) ||
    LibMetric.isLatitude(dim) ||
    LibMetric.isLongitude(dim)
  ) {
    return false;
  }

  return LibMetric.isState(dim) || LibMetric.isCountry(dim) || LibMetric.isCity(dim);
}

export function getMapRegionForDimension(
  dim: DimensionMetadata,
): string | null {
  if (LibMetric.isState(dim)) {
    return "us_states";
  }
  if (LibMetric.isCountry(dim)) {
    return "world_countries";
  }
  if (LibMetric.isCity(dim)) {
    return "us_states";
  }
  return null;
}

export function isDimensionCandidate(dim: DimensionMetadata): boolean {
  return (
    !LibMetric.isPrimaryKey(dim) &&
    !LibMetric.isForeignKey(dim) &&
    !LibMetric.isURL(dim) &&
    !LibMetric.isLatitude(dim) &&
    !LibMetric.isLongitude(dim) &&
    !LibMetric.isCoordinate(dim)
  );
}

const GEO_SUBTYPE_PRIORITY = {
  country: 0,
  state: 1,
  city: 2,
} as const;

type GeoSubtype = keyof typeof GEO_SUBTYPE_PRIORITY;

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: GeoSubtype;
  predicate: (dim: DimensionMetadata) => boolean;
}> = [
  { subtype: "country", predicate: LibMetric.isCountry },
  { subtype: "state", predicate: LibMetric.isState },
  { subtype: "city", predicate: LibMetric.isCity },
];

export function getGeoDimensionRank(dim: DimensionMetadata): number {
  for (const { subtype, predicate } of GEO_SUBTYPE_PREDICATES) {
    if (predicate(dim)) {
      return GEO_SUBTYPE_PRIORITY[subtype] ?? 999;
    }
  }
  return 999;
}

// ── Dimension lookup ──

export function findDimension(
  def: MetricDefinition,
  dimensionName: string,
): DimensionMetadata | null {
  const dims = LibMetric.projectionableDimensions(def);
  return (
    dims.find((dim) => {
      const info = LibMetric.displayInfo(def, dim);
      return info.name === dimensionName;
    }) ?? null
  );
}

export function findTemporalBucket(
  def: MetricDefinition,
  dim: DimensionMetadata,
  targetUnit: TemporalUnit,
): LibMetric.TemporalBucket | null {
  const buckets = LibMetric.availableTemporalBuckets(def, dim);
  const bucket = buckets.find((b) => {
    const info = LibMetric.displayInfo(def, b);
    return info.shortName === targetUnit;
  });
  return bucket ?? null;
}

// ── Projection application ──

export function applyBinnedProjection(
  def: MetricDefinition,
  dimensionName: string,
  binningStrategy: string | null,
): MetricDefinition {
  const projs = LibMetric.projections(def);

  const targetDim = findDimension(def, dimensionName);
  if (!targetDim) {
    return def;
  }

  let newProjection: ProjectionClause;

  // first project the dimension to get a projection clause we can modify
  const tempDef = LibMetric.project(
    projs.reduce<MetricDefinition>(
      (d, p) => LibMetric.removeClause(d, p),
      def,
    ),
    targetDim,
  );
  const tempProjs = LibMetric.projections(tempDef);
  if (tempProjs.length === 0) {
    return def;
  }
  const baseProjection = tempProjs[tempProjs.length - 1];

  if (binningStrategy === UNBINNED) {
    newProjection = LibMetric.withBinning(baseProjection, null);
  } else if (binningStrategy !== null) {
    const strategies = LibMetric.availableBinningStrategies(def, targetDim);
    const strategy =
      strategies.find((s) => {
        const info = LibMetric.displayInfo(def, s);
        return info.displayName === binningStrategy;
      }) ?? null;
    newProjection = LibMetric.withBinning(baseProjection, strategy);
  } else {
    newProjection = LibMetric.withDefaultBinning(tempDef, baseProjection);
  }

  return LibMetric.replaceClause(tempDef, baseProjection, newProjection);
}

export function applyProjection(
  def: MetricDefinition,
  dimensionName: string,
): MetricDefinition {
  const targetDim = findDimension(def, dimensionName);
  if (!targetDim) {
    return def;
  }

  // Remove existing projections
  let result = def;
  for (const proj of LibMetric.projections(def)) {
    result = LibMetric.removeClause(result, proj);
  }

  return LibMetric.project(result, targetDim);
}

export function applyTemporalUnit(
  def: MetricDefinition,
  unit: TemporalUnit,
): MetricDefinition {
  const projs = LibMetric.projections(def);
  if (projs.length === 0) {
    return def;
  }

  const projection = projs[0];
  const dim = LibMetric.projectionDimension(def, projection);
  if (!dim || !LibMetric.isDateOrDateTime(dim)) {
    return def;
  }

  const bucket = findTemporalBucket(def, dim, unit);
  if (!bucket) {
    return def;
  }

  const newProjection = LibMetric.withTemporalBucket(projection, bucket);
  return LibMetric.replaceClause(def, projection, newProjection);
}

// ── Filter application ──

export function removeFiltersOnDimension(
  def: MetricDefinition,
  dimensionName: string,
): MetricDefinition {
  const existingFilters = LibMetric.filters(def);

  let result = def;
  for (const f of existingFilters) {
    const parts = LibMetric.filterParts(def, f);
    if (parts && "dimension" in parts && parts.dimension) {
      const dimInfo = LibMetric.displayInfo(def, parts.dimension);
      if (dimInfo.name === dimensionName) {
        result = LibMetric.removeClause(result, f);
      }
    }
  }
  return result;
}

export function applyDatePickerFilter(
  def: MetricDefinition,
  dimensionName: string,
  value: DatePickerValue | undefined,
): MetricDefinition {
  let result = removeFiltersOnDimension(def, dimensionName);

  if (value) {
    const dim = findDimension(result, dimensionName);
    if (dim) {
      const filterClause = getDateFilterClause(dim, value);
      result = LibMetric.filter(result, filterClause);
    }
  }

  return result;
}

// ── Breakout application ──

export function applyBreakoutDimension(
  def: MetricDefinition,
  breakoutDimension: DimensionMetadata,
): MetricDefinition {
  const projectable = LibMetric.projectionableDimensions(def);
  if (!projectable.some((d) => LibMetric.isSameSource(d, breakoutDimension))) {
    return def;
  }

  const alreadyProjected = LibMetric.projections(def).some((p) => {
    const dim = LibMetric.projectionDimension(def, p);
    return dim != null && LibMetric.isSameSource(breakoutDimension, dim);
  });

  return alreadyProjected ? def : LibMetric.project(def, breakoutDimension);
}

// ── Composite definition builder ──

export function buildExecutableDefinition(
  baseDef: MetricDefinition,
  tab: MetricsViewerTabState,
  dimensionId: string | undefined,
): MetricDefinition | null {
  if (!dimensionId) {
    return null;
  }

  let def = baseDef;

  if (tab.type === "time") {
    def = applyProjection(def, dimensionId);

    if (tab.projectionTemporalUnit) {
      def = applyTemporalUnit(def, tab.projectionTemporalUnit);
    } else {
      const projs = LibMetric.projections(def);
      if (projs.length > 0) {
        const defaultProj = LibMetric.withDefaultTemporalBucket(def, projs[0]);
        def = LibMetric.replaceClause(def, projs[0], defaultProj);
      }
    }

    const projs = LibMetric.projections(def);
    if (projs.length > 0) {
      const dim = LibMetric.projectionDimension(def, projs[0]);
      if (dim && tab.filter) {
        const dimInfo = LibMetric.displayInfo(def, dim);
        def = applyDatePickerFilter(def, dimInfo.name!, tab.filter);
      }
    }
  } else if (tab.type === "numeric") {
    def = applyBinnedProjection(def, dimensionId, tab.binningStrategy ?? null);
  } else {
    def = applyProjection(def, dimensionId);
  }

  return def;
}

// ── Projection inspection ──

export type ProjectionInfo = {
  projection: ProjectionClause | undefined;
  projectionDimension: DimensionMetadata | undefined;
  filterDimension: DimensionMetadata | undefined;
  filter: FilterClause | undefined;
  isTemporalBucketable: boolean;
  isBinnable: boolean;
  hasBinning: boolean;
};

export function getProjectionInfo(def: MetricDefinition): ProjectionInfo {
  const allProjections = LibMetric.projections(def);
  const firstProjection = allProjections[0];

  const projDim = firstProjection
    ? (LibMetric.projectionDimension(def, firstProjection) ?? undefined)
    : undefined;

  const isTemporalBucketable = projDim
    ? LibMetric.isTemporalBucketable(def, projDim)
    : false;
  const isBinnable = projDim
    ? LibMetric.isBinnable(def, projDim)
    : false;
  const hasBinning = firstProjection
    ? LibMetric.binning(firstProjection) !== null
    : false;

  let filterDimension: DimensionMetadata | undefined;
  let filterClause: FilterClause | undefined;

  if (isTemporalBucketable && projDim) {
    const dimInfo = LibMetric.displayInfo(def, projDim);
    const filterableDims = LibMetric.filterableDimensions(def);
    filterDimension = filterableDims.find((d) => {
      const info = LibMetric.displayInfo(def, d);
      return info.name === dimInfo.name;
    });

    if (filterDimension) {
      const existingFilters = LibMetric.filters(def);
      for (const f of existingFilters) {
        const parts = LibMetric.filterParts(def, f);
        if (parts && "dimension" in parts && parts.dimension) {
          const fDimInfo = LibMetric.displayInfo(def, parts.dimension);
          if (fDimInfo.name === dimInfo.name) {
            filterClause = f;
            break;
          }
        }
      }
    }
  }

  return {
    projection: firstProjection,
    projectionDimension: projDim,
    filterDimension,
    filter: filterClause,
    isTemporalBucketable,
    isBinnable,
    hasBinning,
  };
}
