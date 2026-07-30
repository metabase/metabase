import fetchMock from "fetch-mock";

import type {
  ListSlowFindingsResponse,
  ListStaleFindingsResponse,
} from "metabase-types/api";

export function setupListStaleFindingsEndpoint(
  response: ListStaleFindingsResponse,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/stale", response);
}

export function setupListSlowFindingsEndpoint(
  response: ListSlowFindingsResponse,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/slow", response);
}
