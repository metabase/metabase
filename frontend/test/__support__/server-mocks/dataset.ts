import fetchMock from "fetch-mock";

import type { CardQueryMetadata, ParameterValues } from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupAdhocQueryMetadataEndpoint(metadata: CardQueryMetadata) {
  fetchMock.post(`path:/api/dataset/query_metadata`, metadata, { name: "dataset-query-metadata" });
}

export function setupParameterValuesEndpoints(response: ParameterValues) {
  fetchMock.post("path:/api/dataset/parameter/values", response, { name: "dataset-parameter-values" });
}

export function setupErrorParameterValuesEndpoints() {
  try {
    fetchMock.removeRoute("dataset-parameter-values");
  } catch {
    // Route might not exist, ignore
  }
  fetchMock.post("path:/api/dataset/parameter/values", 500, { name: "dataset-parameter-values" });
}

export function setupParameterSearchValuesEndpoint(
  query: string,
  response: ParameterValues,
) {
  fetchMock.post({
    url: `path:/api/dataset/parameter/search/${encodeURIComponent(query)}`,
  }, response, { name: `dataset-parameter-search-${query}` });
}

export function setupCardDataset(
  options: MockDatasetOpts = {},
  overwriteRoutes = false,
) {
  if (overwriteRoutes) {
    try {
      fetchMock.removeRoute("dataset-post");
    } catch {
      // Route might not exist, ignore
    }
  }
  fetchMock.post("path:/api/dataset", createMockDataset(options), { name: "dataset-post" });
}
