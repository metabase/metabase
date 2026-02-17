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
import type {
  MetricsViewerTabDefinitionConfig,
  MetricsViewerTabState,
} from "../types/viewer-state";

// ── Dimension classification ──

export function isGeoDimension(dim: DimensionMetadata): boolean {
  if (
    LibMetric.isCoordinate(dim) ||
    LibMetric.isLatitude(dim) ||
    LibMetric.isLongitude(dim)
  ) {
    return false;
  }

  return (
    LibMetric.isState(dim) || LibMetric.isCountry(dim) || LibMetric.isCity(dim)
  );
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

export function findDimensionById(
  def: MetricDefinition,
  dimensionId: string,
): DimensionMetadata | null {
  const dims = LibMetric.projectionableDimensions(def);
  return (
    dims.find((dim) => {
      const info = LibMetric.dimensionValuesInfo(def, dim);
      return info.id === dimensionId;
    }) ?? null
  );
}

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

export function resolveDimension(
  def: MetricDefinition,
  tabDef: MetricsViewerTabDefinitionConfig,
): DimensionMetadata | undefined {
  if (tabDef.projectionDimension) {
    return tabDef.projectionDimension;
  }
  if (tabDef.projectionDimensionId) {
    return findDimension(def, tabDef.projectionDimensionId) ?? undefined;
  }
  return undefined;
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
  dimension: DimensionMetadata,
  binningStrategy: string | null,
): MetricDefinition {
  const projs = LibMetric.projections(def);

  let newProjection: ProjectionClause;

  const tempDef = LibMetric.project(
    projs.reduce<MetricDefinition>((d, p) => LibMetric.removeClause(d, p), def),
    LibMetric.dimensionReference(dimension),
  );
  const tempProjs = LibMetric.projections(tempDef);
  if (tempProjs.length === 0) {
    return def;
  }
  const baseProjection = tempProjs[tempProjs.length - 1];

  if (binningStrategy === UNBINNED) {
    newProjection = LibMetric.withBinning(baseProjection, null);
  } else if (binningStrategy !== null) {
    const strategies = LibMetric.availableBinningStrategies(def, dimension);
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
  dimension: ProjectionClause,
): MetricDefinition {
  let result = def;
  for (const proj of LibMetric.projections(def)) {
    result = LibMetric.removeClause(result, proj);
  }

  return LibMetric.project(result, dimension);
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
    if (parts) {
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

export function buildBinnedBreakoutDef(
  baseDef: MetricDefinition,
  breakoutDimension: ProjectionClause,
): MetricDefinition {
  if (
    LibMetric.temporalBucket(breakoutDimension) ||
    LibMetric.binning(breakoutDimension)
  ) {
    return applyProjection(baseDef, breakoutDimension);
  }

  const def = applyProjection(baseDef, breakoutDimension);
  const projs = LibMetric.projections(def);
  if (projs.length === 0) {
    return def;
  }

  const proj = projs[projs.length - 1];
  const dim = LibMetric.projectionDimension(def, proj);
  if (!dim) {
    return def;
  }

  if (LibMetric.isBinnable(def, dim)) {
    return LibMetric.replaceClause(
      def,
      proj,
      LibMetric.withDefaultBinning(def, proj),
    );
  }
  if (LibMetric.isTemporalBucketable(def, dim)) {
    return LibMetric.replaceClause(
      def,
      proj,
      LibMetric.withDefaultTemporalBucket(def, proj),
    );
  }
  return def;
}

export function applyBreakoutDimension(
  baseDef: MetricDefinition,
  execDef: MetricDefinition,
  breakoutDimension: ProjectionClause,
): MetricDefinition {
  if (
    LibMetric.temporalBucket(breakoutDimension) ||
    LibMetric.binning(breakoutDimension)
  ) {
    return LibMetric.project(execDef, breakoutDimension);
  }

  // Build binned projection from baseDef (single-projection context),
  // then add it to execDef
  const binnedDef = buildBinnedBreakoutDef(baseDef, breakoutDimension);
  const binnedProjs = LibMetric.projections(binnedDef);
  if (binnedProjs.length === 0) {
    return LibMetric.project(execDef, breakoutDimension);
  }

  const binnedProj = binnedProjs[binnedProjs.length - 1];
  return LibMetric.project(execDef, binnedProj);
}

// ── Composite definition builder ──

export function buildExecutableDefinition(
  baseDef: MetricDefinition,
  tab: MetricsViewerTabState,
  dimension: DimensionMetadata | undefined,
): MetricDefinition | null {
  if (!dimension) {
    return null;
  }

  let def = baseDef;

  const dimRef = LibMetric.dimensionReference(dimension);

  if (tab.type === "time") {
    def = applyProjection(def, dimRef);

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
        if (dimInfo.name) {
          def = applyDatePickerFilter(def, dimInfo.name, tab.filter);
        }
      }
    }
  } else if (tab.type === "numeric") {
    def = applyBinnedProjection(def, dimension, tab.binningStrategy);
  } else {
    def = applyProjection(def, dimRef);
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
  const isBinnable = projDim ? LibMetric.isBinnable(def, projDim) : false;
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
        if (parts) {
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
