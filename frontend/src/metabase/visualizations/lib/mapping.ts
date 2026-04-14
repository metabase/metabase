import type { RowValue } from "metabase-types/api";

import { COUNTRY_NAME_TO_CODE, STATE_CODES } from "./mapping_codes";

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
  // Special case for supporting both US state names and state codes
  // This should be ok because we know there's no overlap between state names and codes, and we know the "us_states" region map expects codes
  if (region === "us_states" && stateNamesMap.has(normalizedKey)) {
    return stateNamesMap.get(normalizedKey) as string; // ok to cast because 1 line above we check presence of the key in the map
  } else if (
    region === "world_countries" &&
    normalizedKey in COUNTRY_NAME_TO_CODE
  ) {
    return COUNTRY_NAME_TO_CODE[normalizedKey];
  } else {
    return normalizedKey;
  }
}
