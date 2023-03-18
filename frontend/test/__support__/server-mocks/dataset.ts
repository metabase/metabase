import fetchMock from "fetch-mock";
import { ParameterValues } from "metabase-types/api";

export function setupParameterValuesEndpoints(
  parameterValues: ParameterValues,
) {
  fetchMock.post("path:/api/dataset/parameter/values", parameterValues);
}

export function setupErrorParameterValuesEndpoints() {
  fetchMock.post("path:/api/dataset/parameter/values", 500);
}
