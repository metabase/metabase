import fetchMock from "fetch-mock";

import type {
  RunTransformTestResponse,
  TransformTest,
  TransformTestId,
} from "metabase-types/api";

export function setupListTransformTestsEndpoint(tests: TransformTest[]) {
  fetchMock.get("path:/api/ee/transform-test", tests);
}

export function setupGetTransformTestEndpoint(test: TransformTest) {
  fetchMock.get(`path:/api/ee/transform-test/${test.id}`, test);
}

export function setupRunTransformTestEndpoint(
  testId: TransformTestId,
  response: RunTransformTestResponse,
) {
  fetchMock.post(`path:/api/ee/transform-test/${testId}/run`, response);
}
