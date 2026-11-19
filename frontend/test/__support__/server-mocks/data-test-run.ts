import fetchMock from "fetch-mock";

import type {
  DataTestRunDetail,
  ListDataTestRunsResponse,
} from "metabase-types/api";

export function setupListDataTestRunsEndpoint(
  response: ListDataTestRunsResponse,
) {
  fetchMock.get("path:/api/ee/data-test-run", response);
}

export function setupGetDataTestRunEndpoint(run: DataTestRunDetail) {
  fetchMock.get(`path:/api/ee/data-test-run/${run.id}`, run);
}
