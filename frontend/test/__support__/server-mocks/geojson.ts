import fetchMock from "fetch-mock";
import type { FeatureCollection } from "geojson";

export function setupGeoJSONEndpoint({
  featureCollection,
  url,
}: {
  featureCollection: FeatureCollection;
  url: string;
}) {
  fetchMock.get(`path:/api/geojson`, featureCollection, {
    name: url,
    query: {
      url,
    },
  });
}
