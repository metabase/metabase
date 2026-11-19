import fetchMock from "fetch-mock";

import type {
  ActionTest,
  ActionTestId,
  RunActionTestResponse,
} from "metabase-types/api";

export function setupListActionTestsEndpoint(tests: ActionTest[]) {
  fetchMock.get("path:/api/ee/action-test", tests);
}

export function setupGetActionTestEndpoint(test: ActionTest) {
  fetchMock.get(`path:/api/ee/action-test/${test.id}`, test);
}

export function setupRunActionTestEndpoint(
  testId: ActionTestId,
  response: RunActionTestResponse,
) {
  fetchMock.post(`path:/api/ee/action-test/${testId}/run`, response);
}
