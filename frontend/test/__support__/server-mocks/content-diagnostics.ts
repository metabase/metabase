import fetchMock from "fetch-mock";

import type { ListStaleFindingsResponse } from "metabase-types/api";

export function setupListStaleFindingsEndpoint(
  response: ListStaleFindingsResponse,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/stale", response);
}
