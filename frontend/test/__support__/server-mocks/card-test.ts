import fetchMock from "fetch-mock";

import type {
  CardTest,
  CardTestId,
  RunCardTestResponse,
} from "metabase-types/api";

export function setupListCardTestsEndpoint(tests: CardTest[]) {
  fetchMock.get("path:/api/ee/card-test", tests);
}

export function setupGetCardTestEndpoint(test: CardTest) {
  fetchMock.get(`path:/api/ee/card-test/${test.id}`, test);
}

export function setupRunCardTestEndpoint(
  testId: CardTestId,
  response: RunCardTestResponse,
) {
  fetchMock.post(`path:/api/ee/card-test/${testId}/run`, response);
}
