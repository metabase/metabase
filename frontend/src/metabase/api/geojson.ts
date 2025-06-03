import type { Feature, FeatureCollection } from "geojson";
import { t } from "ttag";

import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";
import type { GeoJSONData } from "metabase-types/api";

import { Api } from "./api";

export const geojsonApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    loadGeoJSON: builder.query<GeoJSONData, { url: string }>({
      query: (params) => ({
        method: "GET",
        url: `/api/geojson`,
        params,
      }),
      transformResponse: (response: unknown) => {
        assertsValidGeoJson(response);
        return response;
      },
    }),
  }),
});

function assertsValidGeoJson(
  rawGeoJsonData: unknown,
): asserts rawGeoJsonData is Feature | FeatureCollection {
  if (!rawGeoJsonData) {
    throw new Error(t`Invalid custom GeoJSON`);
  }

  const validatedData = rawGeoJsonData as any; // We'll validate the structure step by step

  if (!validatedData.type) {
    throw new Error(t`Invalid custom GeoJSON`);
  }

  if (
    validatedData.type !== "FeatureCollection" &&
    validatedData.type !== "Feature"
  ) {
    throw new Error(t`Invalid custom GeoJSON: does not contain features`);
  }

  if (validatedData.type === "FeatureCollection") {
    if (!validatedData.features || validatedData.features.length === 0) {
      throw new Error(t`Invalid custom GeoJSON: does not contain features`);
    }

    for (const feature of validatedData.features) {
      if (!feature.properties) {
        throw new Error(
          t`Invalid custom GeoJSON: feature is missing properties`,
        );
      }
    }

    const bounds = computeMinimalBounds(validatedData.features);
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();

    if (
      [
        [northEast.lat, northEast.lng],
        [southWest.lat, southWest.lng],
      ].every(([lat, lng]) => lat < -90 || lat > 90 || lng < -180 || lng > 180)
    ) {
      throw new Error(
        t`Invalid custom GeoJSON: coordinates are outside bounds for latitude and longitude`,
      );
    }
  }

  if (validatedData.type === "Feature") {
    if (!validatedData.properties) {
      throw new Error(t`Invalid custom GeoJSON: feature is missing properties`);
    }
  }
}

export const { useLazyLoadGeoJSONQuery } = geojsonApi;
