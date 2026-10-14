import fetchMock, { type CallLog } from "fetch-mock";

import type {
  InvalidateFindingsResponse,
  ListDuplicatedFindingsResponse,
  ListImbalancedFindingsResponse,
  ListSlowFindingsResponse,
  ListStaleFindingsResponse,
} from "metabase-types/api";

type MockResponse<T> = T | ((call: CallLog) => T | Promise<T>);

export function setupInvalidateFindingsEndpoint(
  response: MockResponse<InvalidateFindingsResponse | Response>,
) {
  fetchMock.post("path:/api/ee/content-diagnostics/invalidate", response, {
    name: "invalidate-findings",
  });
}

export function setupInvalidateFindingsEndpointWithError(error: object) {
  fetchMock.post(
    "path:/api/ee/content-diagnostics/invalidate",
    { status: 500, body: error },
    { name: "invalidate-findings" },
  );
}

export function setupListStaleFindingsEndpoint(
  response: MockResponse<ListStaleFindingsResponse>,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/stale", response);
}

export function setupListSlowFindingsEndpoint(
  response: MockResponse<ListSlowFindingsResponse>,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/slow", response);
}

export function setupListDuplicatedFindingsEndpoint(
  response: MockResponse<ListDuplicatedFindingsResponse>,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/duplicated", response);
}

export function setupListImbalancedFindingsEndpoint(
  response: MockResponse<ListImbalancedFindingsResponse>,
) {
  fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", response);
}
