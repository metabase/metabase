import fetchMock from "fetch-mock";

import type {
  CheckDependenciesResponse,
  DependencyGraph,
  DependencyNode,
  ListBreakingGraphNodesResponse,
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

export function setupListGraphNodeDependentsEndpoint(nodes: DependencyNode[]) {
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", nodes);
}

export function setupListBreakingGraphNodesEndpoint(
  response: ListBreakingGraphNodesResponse,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/breaking", response);
}

export function setupListBrokenGraphNodesEndpoint(nodes: DependencyNode[]) {
  fetchMock.get("path:/api/ee/dependencies/graph/broken", nodes);
}

export function setupListUnreferencedGraphNodesEndpoint(
  response: ListUnreferencedGraphNodesResponse,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/unreferenced", response);
}

export function setupDependecyGraphEndpoint(response: DependencyGraph) {
  fetchMock.get("path:/api/ee/dependencies/graph", response);
}
