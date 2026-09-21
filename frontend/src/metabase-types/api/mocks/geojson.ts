import type { FeatureCollection } from "geojson";

/**
 * Coordinates in a projected CRS (metres, EPSG:3857-style) rather than lat/lng.
 * Every corner of the resulting bounds falls outside [-90, 90] / [-180, 180],
 * which is what the bounds check in `metabase/api/geojson` rejects.
 */
export const createMockProjectedGeoJSONFeatureCollection = (
  opts?: Partial<FeatureCollection>,
): FeatureCollection => {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          NUTS_ID: "CY0",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [6467380.1095, 1643361.6693],
              [6413298.6548, 1602175.7146],
              [6378262.9871, 1596714.9674],
              [6357016.4182, 1609132.5381],
              [6467380.1095, 1643361.6693],
            ],
          ],
        },
      },
    ],
    ...opts,
  };
};

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
