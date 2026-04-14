import * as d3 from "d3";
import type { Feature, Position } from "geojson";
import L from "leaflet";

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
