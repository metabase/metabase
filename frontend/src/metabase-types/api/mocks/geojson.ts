import type { FeatureCollection } from "geojson";

export const createMockGeoJSONFeatureCollection = (
  opts?: Partial<FeatureCollection>,
): FeatureCollection => {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          scalerank: null,
          featureclass: "WGS84 bounding box",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [180, -90],
              [-180, -90],
              [-180, 90],
              [180, 90],
              [180, -90],
            ],
          ],
        },
      },
    ],
    ...opts,
  };
};
