import { Scope } from "nock";
import { ParameterValues } from "metabase-types/api";

export function setupParameterValuesEndpoints(
  scope: Scope,
  parameterValues: ParameterValues,
) {
  scope.post("/api/dataset/parameter/values").reply(200, parameterValues);
}

export function setupErrorParameterValuesEndpoints(scope: Scope) {
  scope.post("/api/dataset/parameter/values").reply(500);
}
