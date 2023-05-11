import fetchMock from "fetch-mock";
import { ParameterValues } from "metabase-types/api";
import { createMockDataset, MockDatasetOpts } from "metabase-types/api/mocks";

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
  console.log(options);
  fetchMock.post("path:/api/dataset", createMockDataset(options), {
    overwriteRoutes,
  });
}
