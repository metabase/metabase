import type { Feature } from "geojson";

import { computeMinimalBounds, getAllFeaturesPoints } from "./geometry";

const polygonFeature: Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [10, 20],
        [30, 40],
        [50, 60],
        [10, 20],
      ],
    ],
  },
};

const multiPolygonFeature: Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-10, -20],
          [-30, -40],
          [-10, -20],
        ],
      ],
      [
        [
          [100, 50],
          [110, 60],
          [100, 50],
        ],
      ],
    ],
  },
};

describe("getAllFeaturesPoints", () => {
  it("should extract points from Polygon features", () => {
    const points = getAllFeaturesPoints([polygonFeature]);
    expect(points).toEqual([
      [10, 20],
      [30, 40],
      [50, 60],
      [10, 20],
    ]);
  });

  it("should extract points from MultiPolygon features", () => {
    const points = getAllFeaturesPoints([multiPolygonFeature]);
    expect(points).toEqual([
      [-10, -20],
      [-30, -40],
      [-10, -20],
      [100, 50],
      [110, 60],
      [100, 50],
    ]);
  });

  it("should combine points from multiple features", () => {
    const points = getAllFeaturesPoints([polygonFeature, multiPolygonFeature]);
    expect(points).toHaveLength(10);
  });

  it("should return empty array for empty input", () => {
    expect(getAllFeaturesPoints([])).toEqual([]);
  });

  it("should warn and skip unsupported geometry types", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const pointFeature: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [1, 2] },
    };

    const points = getAllFeaturesPoints([pointFeature]);
    expect(points).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "Unimplemented feature.geometry.type",
      "Point",
    );
    spy.mockRestore();
  });
});

describe("computeMinimalBounds", () => {
  it("should compute bounds that contain all feature points", () => {
    const bounds = computeMinimalBounds([polygonFeature]);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // coordinates are [lng, lat] in GeoJSON
    // west=10, east=50 (longitude / x), north=20, south=60 (latitude / y)
    expect(sw.lng).toBe(10);
    expect(ne.lng).toBe(50);
    expect(sw.lat).toBe(20);
    expect(ne.lat).toBe(60);
  });

  it("should compute bounds across multiple features", () => {
    const bounds = computeMinimalBounds([polygonFeature, multiPolygonFeature]);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // x (lng) range: -30 to 110, y (lat) range: -40 to 60
    expect(sw.lng).toBe(-30);
    expect(ne.lng).toBe(110);
    expect(sw.lat).toBe(-40);
    expect(ne.lat).toBe(60);
  });

  it("should return zero bounds for empty features", () => {
    const bounds = computeMinimalBounds([]);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    expect(ne.lat).toBe(0);
    expect(ne.lng).toBe(0);
    expect(sw.lat).toBe(0);
    expect(sw.lng).toBe(0);
  });
});
