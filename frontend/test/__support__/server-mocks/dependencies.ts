import fetchMock from "fetch-mock";

import type { CheckDependenciesResponse } from "metabase-types/api";

export function setupCheckCardDependenciesEndpoint(
  response: CheckDependenciesResponse,
) {
  fetchMock.post("path:/api/ee/dependencies/check_card", response);
}

export function setupCheckCardDependenciesEndpointError() {
  fetchMock.post("path:/api/ee/dependencies/check_card", { status: 500 });
}

export function setupCheckSnippetDependenciesEndpoint(
  response: CheckDependenciesResponse,
) {
  fetchMock.post("path:/api/ee/dependencies/check_snippet", response);
}

export function setupCheckTransformDependenciesEndpoint(
  response: CheckDependenciesResponse,
) {
  fetchMock.post("path:/api/ee/dependencies/check_transform", response);
}
