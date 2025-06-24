import fetchMock from "fetch-mock";

import type { CardQueryMetadata, ParameterValues } from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupAdhocQueryMetadataEndpoint(metadata: CardQueryMetadata) {
  fetchMock.post(`path:/api/dataset/query_metadata`, metadata);
}

export function setupParameterValuesEndpoints(response: ParameterValues) {
  fetchMock.post("path:/api/dataset/parameter/values", response);
}

export function setupErrorParameterValuesEndpoints() {
  fetchMock.post("path:/api/dataset/parameter/values", 500);
}

export function setupParameterSearchValuesEndpoint(
  query: string,
  response: ParameterValues,
) {
  fetchMock.post(
    {
      url: `path:/api/dataset/parameter/search/${encodeURIComponent(query)}`,
    },
    response,
    { overwriteRoutes: false },
  );
}

export function setupCardDataset(
  options: MockDatasetOpts = {},
  overwriteRoutes = false,
) {
  fetchMock.post("path:/api/dataset", createMockDataset(options), {
    overwriteRoutes,
  });
}
