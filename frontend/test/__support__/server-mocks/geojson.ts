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

/**
 * A 200 carrying a payload that the client-side validator in `metabase/api/geojson`
 * rejects. Those checks — feature shape and lat/lng bounds — run in `transformResponse`,
 * so the payload has to reach the client intact rather than fail at the request.
 */
export function setupMalformedGeoJSONEndpoint({
  payload,
  url,
}: {
  payload: object;
  url: string;
}) {
  fetchMock.get(
    `path:/api/geojson`,
    { body: payload },
    {
      name: url,
      query: {
        url,
      },
    },
  );
}

/**
 * A non-2xx from `/api/geojson`. The backend surfaces these as a bare string body
 * (see `api-exception-response` in `metabase.server.middleware.exceptions`), which
 * the API client rethrows as `{ status, data }`.
 */
export function setupGeoJSONEndpointWithError({
  message,
  status = 400,
  url,
}: {
  message: string;
  status?: number;
  url: string;
}) {
  fetchMock.get(
    `path:/api/geojson`,
    { body: message, status },
    {
      name: url,
      query: {
        url,
      },
    },
  );
}
