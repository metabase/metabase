import fetchMock from "fetch-mock";

import type {
  DependencyGraph,
  DependencyNode,
  ListBreakingGraphNodesResponse,
  ListUnreferencedGraphNodesResponse,
} from "metabase-types/api";

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
