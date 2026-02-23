import type {
  BooleanFilterParts,
  CoordinateFilterParts,
  DefaultFilterParts,
  DimensionMetadata,
  ExcludeDateFilterParts,
  FilterClause,
  MetricDefinition,
  NumberFilterParts,
  ProjectionClause,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

import { UNBINNED } from "../constants";

// ── Dimension filter value (serializable, dimension-free) ──

export type DimensionFilterValue =
  | {
      type: "string";
      operator: StringFilterParts["operator"];
      values: string[];
      options: StringFilterParts["options"];
    }
  | {
      type: "boolean";
      operator: BooleanFilterParts["operator"];
      values: boolean[];
    }
  | {
      type: "number";
      operator: NumberFilterParts["operator"];
      values: NumberFilterParts["values"];
    }
  | {
      type: "coordinate";
      operator: CoordinateFilterParts["operator"];
      values: CoordinateFilterParts["values"];
    }
  | {
      type: "specific-date";
      operator: SpecificDateFilterParts["operator"];
      values: Date[];
      hasTime: boolean;
    }
  | {
      type: "relative-date";
      unit: RelativeDateFilterParts["unit"];
      value: number;
      offsetUnit: RelativeDateFilterParts["offsetUnit"];
      offsetValue: RelativeDateFilterParts["offsetValue"];
      options: RelativeDateFilterParts["options"];
    }
  | {
      type: "exclude-date";
      operator: ExcludeDateFilterParts["operator"];
      unit: ExcludeDateFilterParts["unit"];
      values: number[];
    }
  | { type: "time"; operator: TimeFilterParts["operator"]; values: Date[] }
  | { type: "default"; operator: DefaultFilterParts["operator"] };

export function extractDimensionFilterValue(
  definition: MetricDefinition,
  filterClause: FilterClause,
): DimensionFilterValue | null {
  const stringParts = LibMetric.stringFilterParts(definition, filterClause);
  if (stringParts) {
    return {
      type: "string",
      operator: stringParts.operator,
      values: stringParts.values,
      options: stringParts.options,
    };
  }

  const booleanParts = LibMetric.booleanFilterParts(definition, filterClause);
  if (booleanParts) {
    return {
      type: "boolean",
      operator: booleanParts.operator,
      values: booleanParts.values,
    };
  }

  const numberParts = LibMetric.numberFilterParts(definition, filterClause);
  if (numberParts) {
    return {
      type: "number",
      operator: numberParts.operator,
      values: numberParts.values,
    };
  }

  const coordParts = LibMetric.coordinateFilterParts(definition, filterClause);
  if (coordParts) {
    return {
      type: "coordinate",
      operator: coordParts.operator,
      values: coordParts.values,
    };
  }

  const specificParts = LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  );
  if (specificParts) {
    return {
      type: "specific-date",
      operator: specificParts.operator,
      values: specificParts.values,
      hasTime: specificParts.hasTime,
    };
  }

  const relativeParts = LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  );
  if (relativeParts) {
    return {
      type: "relative-date",
      unit: relativeParts.unit,
      value: relativeParts.value,
      offsetUnit: relativeParts.offsetUnit,
      offsetValue: relativeParts.offsetValue,
      options: relativeParts.options,
    };
  }

  const excludeParts = LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  );
  if (excludeParts) {
    return {
      type: "exclude-date",
      operator: excludeParts.operator,
      unit: excludeParts.unit,
      values: excludeParts.values,
    };
  }

  const timeParts = LibMetric.timeFilterParts(definition, filterClause);
  if (timeParts) {
    return {
      type: "time",
      operator: timeParts.operator,
      values: timeParts.values,
    };
  }

  const defaultParts = LibMetric.defaultFilterParts(definition, filterClause);
  if (defaultParts) {
    return {
      type: "default",
      operator: defaultParts.operator,
    };
  }

  return null;
}

export function buildDimensionFilterClause(
  dimension: DimensionMetadata,
  filterValue: DimensionFilterValue,
): FilterClause {
  switch (filterValue.type) {
    case "string":
      return LibMetric.stringFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
        options: filterValue.options,
      });
    case "boolean":
      return LibMetric.booleanFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "number":
      return LibMetric.numberFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "coordinate":
      return LibMetric.coordinateFilterClause({
        operator: filterValue.operator,
        dimension,
        longitudeDimension: null,
        values: filterValue.values,
      });
    case "specific-date":
      return LibMetric.specificDateFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
        hasTime: filterValue.hasTime,
      });
    case "relative-date":
      return LibMetric.relativeDateFilterClause({
        dimension,
        unit: filterValue.unit,
        value: filterValue.value,
        offsetUnit: filterValue.offsetUnit,
        offsetValue: filterValue.offsetValue,
        options: filterValue.options,
      });
    case "exclude-date":
      return LibMetric.excludeDateFilterClause({
        operator: filterValue.operator,
        unit: filterValue.unit,
        dimension,
        values: filterValue.values,
      });
    case "time":
      return LibMetric.timeFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "default":
      return LibMetric.defaultFilterClause({
        operator: filterValue.operator,
        dimension,
      });
  }
}

// ── Dimension classification ──

export function isGeoDimension(dimension: DimensionMetadata): boolean {
  if (
    LibMetric.isCoordinate(dimension) ||
    LibMetric.isLatitude(dimension) ||
    LibMetric.isLongitude(dimension)
  ) {
    return false;
  }

  return (
    LibMetric.isState(dimension) ||
    LibMetric.isCountry(dimension) ||
    LibMetric.isCity(dimension)
  );
}

export function getMapRegionForDimension(
  dimension: DimensionMetadata,
): string | null {
  if (LibMetric.isState(dimension)) {
    return "us_states";
  }
  if (LibMetric.isCountry(dimension)) {
    return "world_countries";
  }
  if (LibMetric.isCity(dimension)) {
    return "us_states";
  }
  return null;
}

export function isDimensionCandidate(dimension: DimensionMetadata): boolean {
  return (
    !LibMetric.isPrimaryKey(dimension) &&
    !LibMetric.isForeignKey(dimension) &&
    !LibMetric.isURL(dimension) &&
    !LibMetric.isLatitude(dimension) &&
    !LibMetric.isLongitude(dimension) &&
    !LibMetric.isCoordinate(dimension)
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
  predicate: (dimension: DimensionMetadata) => boolean;
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
): DimensionMetadata | undefined {
  const dims = LibMetric.projectionableDimensions(def);
  return dims.find((dim) => {
    const info = LibMetric.dimensionValuesInfo(def, dim);
    return info.id === dimensionId;
  });
}

function findTemporalBucket(
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

function applyBinnedProjection(
  def: MetricDefinition,
  dimension: DimensionMetadata,
  binningStrategy: string | undefined,
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
  } else if (binningStrategy) {
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

function applyTemporalUnit(
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

function removeFiltersOnDimension(
  def: MetricDefinition,
  dimension: DimensionMetadata,
): MetricDefinition {
  const existingFilters = LibMetric.filters(def);

  let result = def;
  for (const filter of existingFilters) {
    const parts = LibMetric.filterParts(def, filter);
    if (parts && LibMetric.isSameSource(parts.dimension, dimension)) {
      result = LibMetric.removeClause(result, filter);
    }
  }
  return result;
}

function applyDimensionFilter(
  def: MetricDefinition,
  dimension: DimensionMetadata,
  filterValue: DimensionFilterValue,
): MetricDefinition {
  let result = removeFiltersOnDimension(def, dimension);
  const filterClause = buildDimensionFilterClause(dimension, filterValue);
  result = LibMetric.filter(result, filterClause);
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

type ProjectionOptions = {
  projectionTemporalUnit?: TemporalUnit;
  binningStrategy?: string;
  dimensionFilter?: DimensionFilterValue;
};

export function buildExecutableDefinition(
  baseDef: MetricDefinition,
  dimension: DimensionMetadata | undefined,
  options: ProjectionOptions,
): MetricDefinition | null {
  if (!dimension) {
    return null;
  }

  const { projectionTemporalUnit, binningStrategy, dimensionFilter } = options;
  const dimRef = LibMetric.dimensionReference(dimension);

  let def = baseDef;

  if (LibMetric.isTemporalBucketable(baseDef, dimension)) {
    def = applyProjection(def, dimRef);

    if (projectionTemporalUnit) {
      def = applyTemporalUnit(def, projectionTemporalUnit);
    } else {
      const projs = LibMetric.projections(def);
      if (projs.length > 0) {
        const defaultProj = LibMetric.withDefaultTemporalBucket(def, projs[0]);
        def = LibMetric.replaceClause(def, projs[0], defaultProj);
      }
    }
  } else if (LibMetric.isBinnable(baseDef, dimension)) {
    def = applyBinnedProjection(def, dimension, binningStrategy);
  } else {
    def = applyProjection(def, dimRef);
  }

  if (dimensionFilter) {
    const projs = LibMetric.projections(def);
    if (projs.length > 0) {
      const projDim = LibMetric.projectionDimension(def, projs[0]);
      if (projDim) {
        def = applyDimensionFilter(def, projDim, dimensionFilter);
      }
    }
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

  if (projDim) {
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
