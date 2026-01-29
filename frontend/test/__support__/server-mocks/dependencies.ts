import fetchMock from "fetch-mock";

import type {
  CheckDependenciesResponse,
  DependencyNode,
  ListBrokenGraphNodesResponse,
  ListUnreferencedGraphNodesResponse,
} from "metabase-types/api";

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

export function setupListBrokenGraphNodesEndpoint(
  response: ListBrokenGraphNodesResponse,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/broken", response);
}

export function setupListUnreferencedGraphNodesEndpoint(
  response: ListUnreferencedGraphNodesResponse,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/unreferenced", response);
}

export function setupListNodeDependentsEndpoint(
  response: DependencyNode[] = [],
) {
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", response);
}
