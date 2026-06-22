import type { RowValue } from "metabase-types/api";

import { COUNTRY_NAME_TO_CODE, STATE_CODES } from "./mapping_codes";

// This module deliberately avoids importing Leaflet (unlike ./mapping) so it can be used from the
// static-viz bundle, which runs in a headless GraalJS environment where Leaflet cannot load.

const stateNamesMap = new Map(
  STATE_CODES.map(([key, name]) => [name.toLowerCase(), key.toLowerCase()]),
);

/**
 * Canonicalizes row values to match those in the GeoJSONs.
 *
 * Currently transforms US state names to state codes for the "us_states" region map, and just lowercases all others.
 */
export function getCanonicalRowKey(key: RowValue, region?: string): string {
  const normalizedKey = String(key).toLowerCase();
  // State names and codes don't overlap, so for us_states (which expects codes) we map any name to its code.
  if (region === "us_states" && stateNamesMap.has(normalizedKey)) {
    return stateNamesMap.get(normalizedKey) as string;
  } else if (
    region === "world_countries" &&
    normalizedKey in COUNTRY_NAME_TO_CODE
  ) {
    return COUNTRY_NAME_TO_CODE[normalizedKey];
  } else {
    return normalizedKey;
  }
}
