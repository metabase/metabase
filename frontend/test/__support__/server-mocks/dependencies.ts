import fetchMock, { type CallLog, type UserRouteConfig } from "fetch-mock";

import type {
  DependencyCountsResponse,
  DependencyGraph,
  DependencyNode,
  ListBreakingGraphNodesResponse,
  ListUnreferencedGraphNodesResponse,
} from "metabase-types/api";

type MockResponse<T> = T | ((call: CallLog) => T | Promise<T>);

export function setupDependencyCountsEndpoint(
  response: DependencyCountsResponse = { breaking: 0, unreferenced: 0 },
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/ee/dependencies/counts", response, options);
}

export function setupDependencyCountsErrorEndpoint() {
  fetchMock.get("path:/api/ee/dependencies/counts", { status: 500 });
}

export function setupListGraphNodeDependentsEndpoint(nodes: DependencyNode[]) {
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", nodes);
}

export function setupListBreakingGraphNodesEndpoint(
  response: MockResponse<ListBreakingGraphNodesResponse>,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/breaking", response);
}

export function setupListBrokenGraphNodesEndpoint(nodes: DependencyNode[]) {
  fetchMock.get("path:/api/ee/dependencies/graph/broken", nodes);
}

export function setupListUnreferencedGraphNodesEndpoint(
  response: MockResponse<ListUnreferencedGraphNodesResponse>,
) {
  fetchMock.get("path:/api/ee/dependencies/graph/unreferenced", response);
}

export function setupDependencyGraphEndpoint(response: DependencyGraph) {
  fetchMock.get("path:/api/ee/dependencies/graph", response);
}
