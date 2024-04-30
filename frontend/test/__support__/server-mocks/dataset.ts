import fetchMock from "fetch-mock";

import type { ParameterValues } from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import { createMockDataset } from "metabase-types/api/mocks";

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

const nativeDatasetPreview = {
  query: "SELECT\n COUNT(*)\n FROM\n ORDERS",
  params: null,
};

export function setupNativeDatasetEndpoints(response = nativeDatasetPreview) {
  fetchMock.post("path:/api/dataset/native", response);
}

export function setupErrorNativeDatasetEndpoints() {
  fetchMock.post("path:/api/dataset/native", 500);
}
