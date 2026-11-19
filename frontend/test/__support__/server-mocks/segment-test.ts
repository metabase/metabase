import fetchMock from "fetch-mock";

import type {
  RunSegmentTestResponse,
  SegmentTest,
  SegmentTestId,
} from "metabase-types/api";

export function setupListSegmentTestsEndpoint(tests: SegmentTest[]) {
  fetchMock.get("path:/api/ee/segment-test", tests);
}

export function setupGetSegmentTestEndpoint(test: SegmentTest) {
  fetchMock.get(`path:/api/ee/segment-test/${test.id}`, test);
}

export function setupRunSegmentTestEndpoint(
  testId: SegmentTestId,
  response: RunSegmentTestResponse,
) {
  fetchMock.post(`path:/api/ee/segment-test/${testId}/run`, response);
}
