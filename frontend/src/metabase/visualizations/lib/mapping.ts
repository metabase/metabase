import * as d3 from "d3";
import type { Feature, Position } from "geojson";

// getCanonicalRowKey lives in a Leaflet-free module so the static-viz bundle can use it; re-exported
// here to keep existing import sites working.
export { getCanonicalRowKey } from "./region-codes";

export type BoundsCoordinates = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

// Leaflet-free bounds calculation, so this module (and eager consumers such as
// the geojson API) stay out of the leaflet bundle. Leaflet consumers turn these
// plain coordinates into an `L.LatLngBounds` where they need one.
export function computeMinimalBoundsCoordinates(
  features: Feature[],
): BoundsCoordinates {
  const points = getAllFeaturesPoints(features);
  const [minLng, maxLng] = d3.extent(points, (d) => d[0]);
  const [minLat, maxLat] = d3.extent(points, (d) => d[1]);

  // Matches the normalized corners that `L.latLngBounds` would produce.
  return {
    southWest: { lat: minLat ?? 0, lng: minLng ?? 0 },
    northEast: { lat: maxLat ?? 0, lng: maxLng ?? 0 },
  };
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
