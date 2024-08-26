import fetchMock from "fetch-mock";

import type { CardQueryMetadata, ParameterValues } from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupAdhocQueryMetadataEndpoint(metadata: CardQueryMetadata) {
  fetchMock.post(`path:/api/dataset/query_metadata`, metadata);
}

export function setupParameterValuesEndpoints(
  parameterValues: ParameterValues,
) {
  fetchMock.post("path:/api/dataset/parameter/values", parameterValues);
}

export function setupErrorParameterValuesEndpoints() {
  fetchMock.post("path:/api/dataset/parameter/values", 500);
}

export function setupCardDataset(
  options: MockDatasetOpts = {},
  overwriteRoutes = false,
) {
  fetchMock.post("path:/api/dataset", createMockDataset(options), {
    overwriteRoutes,
  });
}
