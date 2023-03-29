import L from "leaflet/dist/leaflet-src.js";
import d3 from "d3";

export function computeMinimalBounds(features) {
  const points = getAllFeaturesPoints(features);
  const [west, east] = d3.extent(points, d => d[0]);
  const [north, south] = d3.extent(points, d => d[1]);

  return L.latLngBounds(
    L.latLng(south, west), // SW
    L.latLng(north, east), // NE
  );
}

export function getAllFeaturesPoints(features) {
  const points = [];
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
