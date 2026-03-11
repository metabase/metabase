import * as d3 from "d3";
import type { Feature, Position } from "geojson";
import L from "leaflet";

import type { RowValue } from "metabase-types/api";

import { COUNTRY_NAME_TO_CODE, STATE_CODES } from "./mapping_codes";

export function computeMinimalBounds(features: Feature[]) {
  const points = getAllFeaturesPoints(features);
  const [west, east] = d3.extent(points, (d) => d[0]);
  const [north, south] = d3.extent(points, (d) => d[1]);

  return L.latLngBounds(
    L.latLng(south ?? 0, west ?? 0), // SW
    L.latLng(north ?? 0, east ?? 0), // NE
  );
}

export function getAllFeaturesPoints(features: Feature[]): Position[] {
  const points: Position[] = [];

  for (const feature of features) {
    if (feature.geometry.type === "Polygon") {
      for (const coordinates of feature.geometry.coordinates) {
        points.push(...coordinates);
      }
    } else if (feature.geometry.type === "MultiPolygon") {
      for (const coordinatesList of feature.geometry.coordinates) {
        for (const coordinates of coordinatesList) {
          points.push(...coordinates);
        }
      }
    } else {
      console.warn(
        "Unimplemented feature.geometry.type",
        feature.geometry.type,
      );
    }
  }

  return points;
}

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
