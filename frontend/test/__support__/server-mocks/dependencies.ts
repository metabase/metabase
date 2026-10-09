import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  DependencyCountsResponse,
  DependencyGraph,
  DependencyNode,
  ListBreakingGraphNodesResponse,
  ListUnreferencedGraphNodesResponse,
} from "metabase-types/api";

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

export function setupDependencyGraphEndpoint(response: DependencyGraph) {
  fetchMock.get("path:/api/ee/dependencies/graph", response);
}
