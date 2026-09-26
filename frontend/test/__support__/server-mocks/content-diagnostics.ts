import fetchMock from "fetch-mock";

import type {
  ListDuplicatedFindingsResponse,
  ListImbalancedFindingsResponse,
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

export function setupListDuplicatedFindingsEndpoint(
  response: ListDuplicatedFindingsResponse,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/duplicated", response);
}

export function setupListImbalancedFindingsEndpoint(
  response: ListImbalancedFindingsResponse,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", response);
}
