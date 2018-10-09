/* @flow weak */

import L from "leaflet/dist/leaflet-src.js";
import d3 from "d3";

export function computeMinimalBounds(features) {
  const points = getAllFeaturesPoints(features);
  const gap = computeLargestGap(points, d => d[0]);
  const [west, east] = d3.extent(points, d => d[0]);
  const [north, south] = d3.extent(points, d => d[1]);

  const normalGapSize = gap[1] - gap[0];
  const antemeridianGapSize = 180 + west + (180 - east);

  if (antemeridianGapSize > normalGapSize) {
    return L.latLngBounds(
      L.latLng(south, west), // SW
      L.latLng(north, east), // NE
    );
  } else {
    return L.latLngBounds(
      L.latLng(south, -360 + gap[1]), // SW
      L.latLng(north, gap[0]), // NE
    );
  }
}

export function computeLargestGap(items, valueAccessor = d => d) {
  const [xMin, xMax] = d3.extent(items, valueAccessor);
  if (xMin === xMax) {
    return [xMin, xMax];
  }

  const buckets = [];
  const bucketSize = (xMax - xMin) / items.length;
  for (const item of items) {
    const x = valueAccessor(item);
    const k = Math.floor((x - xMin) / bucketSize);
    if (buckets[k] === undefined) {
      buckets[k] = [x, x];
    } else {
      buckets[k] = [Math.min(x, buckets[k][0]), Math.max(x, buckets[k][1])];
    }
  }
  let largestGap = [0, 0];
  for (let i = 0; i < items.length; i++) {
    if (buckets[i + 1] === undefined) {
      buckets[i + 1] = buckets[i];
    } else if (
      buckets[i + 1][0] - buckets[i][1] >
      largestGap[1] - largestGap[0]
    ) {
      largestGap = [buckets[i][1], buckets[i + 1][0]];
    }
  }
  return largestGap;
}

export function getAllFeaturesPoints(features) {
  let points = [];
  for (let feature of features) {
    if (feature.geometry.type === "Polygon") {
      for (let coordinates of feature.geometry.coordinates) {
        points = points.concat(coordinates);
      }
    } else if (feature.geometry.type === "MultiPolygon") {
      for (let coordinatesList of feature.geometry.coordinates) {
        for (let coordinates of coordinatesList) {
          points = points.concat(coordinates);
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

const STATE_CODES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AS", "American Samoa"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District Of Columbia"],
  ["FM", "Federated States Of Micronesia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["GU", "Guam"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MH", "Marshall Islands"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["MP", "Northern Mariana Islands"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PW", "Palau"],
  ["PA", "Pennsylvania"],
  ["PR", "Puerto Rico"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VI", "Virgin Islands"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

const stateNamesMap = new Map(
  STATE_CODES.map(([key, name]) => [name.toLowerCase(), key.toLowerCase()]),
);

/**
 * Canonicalizes row values to match those in the GeoJSONs.
 *
 * Currently transforms US state names to state codes for the "us_states" region map, and just lowercases all others.
 */
export function getCanonicalRowKey(key, region) {
  key = String(key).toLowerCase();
  // Special case for supporting both US state names and state codes
  // This should be ok because we know there's no overlap between state names and codes, and we know the "us_states" region map expects codes
  if (region === "us_states" && stateNamesMap.has(key)) {
    return stateNamesMap.get(key);
  } else {
    return key;
  }
}
