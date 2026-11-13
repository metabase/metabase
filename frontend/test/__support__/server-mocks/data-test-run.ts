import fetchMock from "fetch-mock";

import type { ListDataTestRunsResponse } from "metabase-types/api";

export function setupListDataTestRunsEndpoint(
  response: ListDataTestRunsResponse,
) {
  fetchMock.get("path:/api/ee/data-test-run", response);
}
