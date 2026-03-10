import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

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

export const GEO_SUBTYPE_PRIORITY: readonly GeoSubtype[] = [
  "country",
  "state",
  "city",
];

export type GeoSubtype = "country" | "state" | "city";

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
