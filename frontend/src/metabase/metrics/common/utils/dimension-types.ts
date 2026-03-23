import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

export type DimensionType = "time" | "geo" | "category" | "boolean" | "numeric";

export type GeoSubtype = "country" | "state" | "city";

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

export const GEO_SUBTYPE_PRIORITY: readonly GeoSubtype[] = [
  "country",
  "state",
  "city",
];

const GEO_SUBTYPE_PREDICATES: Array<{
  subtype: GeoSubtype;
  predicate: (dimension: DimensionMetadata) => boolean;
}> = [
  { subtype: "country", predicate: LibMetric.isCountry },
  { subtype: "state", predicate: LibMetric.isState },
  { subtype: "city", predicate: LibMetric.isCity },
];

export function getGeoSubtype(dimension: DimensionMetadata): GeoSubtype | null {
  for (const { subtype, predicate } of GEO_SUBTYPE_PREDICATES) {
    if (predicate(dimension)) {
      return subtype;
    }
  }
  return null;
}

export interface DimensionTypeEntry {
  type: DimensionType;
  dimensionPredicate: (dimension: DimensionMetadata) => boolean;
}

export const DIMENSION_TYPE_REGISTRY: DimensionTypeEntry[] = [
  { type: "time", dimensionPredicate: LibMetric.isDateOrDateTime },
  { type: "geo", dimensionPredicate: isGeoDimension },
  {
    type: "category",
    dimensionPredicate: (dimension) =>
      LibMetric.isCategory(dimension) &&
      !isGeoDimension(dimension) &&
      !LibMetric.isBoolean(dimension),
  },
  { type: "boolean", dimensionPredicate: LibMetric.isBoolean },
  {
    type: "numeric",
    dimensionPredicate: (dimension) =>
      LibMetric.isNumeric(dimension) &&
      !LibMetric.isID(dimension) &&
      !LibMetric.isCoordinate(dimension),
  },
];

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
