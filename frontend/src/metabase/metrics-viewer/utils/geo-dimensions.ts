import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

export function getMapRegionForDimension(
  dimension: DimensionMetadata,
): string | null {
  if (LibMetric.isState(dimension)) {
    return "us_states";
  }
  if (LibMetric.isCountry(dimension)) {
    return "world_countries";
  }
  return null;
}
