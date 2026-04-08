import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

export type DimensionType = "time" | "geo" | "category" | "boolean" | "numeric";

export type GeoSubtype = "country" | "state";

export function isGeoDimension(dimension: DimensionMetadata): boolean {
  return LibMetric.isState(dimension) || LibMetric.isCountry(dimension);
}

export const GEO_SUBTYPE_PRIORITY: readonly GeoSubtype[] = ["country", "state"];

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: GeoSubtype;
  predicate: (dimension: DimensionMetadata) => boolean;
}> = [
  { subtype: "country", predicate: LibMetric.isCountry },
  { subtype: "state", predicate: LibMetric.isState },
];

export function getGeoSubtype(dimension: DimensionMetadata): GeoSubtype | null {
  for (const { subtype, predicate } of GEO_SUBTYPE_PREDICATES) {
    if (predicate(dimension)) {
      return subtype;
    }
  }
  return null;
}

export type DimensionPredicate = (dimension: DimensionMetadata) => boolean;

export const DIMENSION_PREDICATES: Record<DimensionType, DimensionPredicate> = {
  time: LibMetric.isDateOrDateTime,
  geo: isGeoDimension,
  category: (dimension) =>
    LibMetric.isCategory(dimension) &&
    !isGeoDimension(dimension) &&
    !LibMetric.isBoolean(dimension),
  boolean: LibMetric.isBoolean,
  numeric: (dimension) =>
    LibMetric.isNumeric(dimension) &&
    !LibMetric.isID(dimension) &&
    !LibMetric.isCoordinate(dimension),
};

export interface DimensionTypeEntry {
  type: DimensionType;
  dimensionPredicate: DimensionPredicate;
}

const DIMENSION_TYPE_ORDER: readonly DimensionType[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
];

export const DIMENSION_TYPE_REGISTRY: DimensionTypeEntry[] =
  DIMENSION_TYPE_ORDER.map((type) => ({
    type,
    dimensionPredicate: DIMENSION_PREDICATES[type],
  }));

export function getDimensionType(
  dimension: DimensionMetadata,
): DimensionType | null {
  for (const entry of DIMENSION_TYPE_REGISTRY) {
    if (entry.dimensionPredicate(dimension)) {
      return entry.type;
    }
  }
  return null;
}
