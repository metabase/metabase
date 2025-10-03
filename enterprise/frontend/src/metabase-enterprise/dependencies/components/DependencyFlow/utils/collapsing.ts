import type { Edge } from "@xyflow/react";

import type { NodeId, NodeType } from "../types";

import { getEdgesByTargetIdMap, getNodeByIdMap } from "./common";

export function isNodeExpanded(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const nodeById = getNodeByIdMap(nodes);
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const targetEdges = edgesByTargetId.get(nodeId) ?? [];
  const sourceNodes = targetEdges.map((edge) => nodeById.get(edge.source));
  return sourceNodes.every((node) => node != null && !node.hidden);
}

function hideNodeSources(
  nodeId: NodeId,
  edgesByTargetId: Map<NodeId, Edge[]>,
  collapsedNodeIds: Set<NodeId>,
) {
  const edges = edgesByTargetId.get(nodeId);
  edges?.forEach((edge) => {
    collapsedNodeIds.add(edge.source);
    hideNodeSources(edge.source, edgesByTargetId, collapsedNodeIds);
  });
}

function getGraphWithCollapsedNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const collapsedNodeIds = new Set<NodeId>();
  hideNodeSources(nodeId, edgesByTargetId, collapsedNodeIds);

  return nodes.map((node) =>
    collapsedNodeIds.has(node.id) ? { ...node, hidden: true } : node,
  );
}

function getNodesWithExpandedNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const nodeEdges = edgesByTargetId.get(nodeId) ?? [];
  const expandedNodeIds = new Set(nodeEdges.map((edge) => edge.source));

  return nodes.map((node) =>
    expandedNodeIds.has(node.id) ? { ...node, hidden: false } : node,
  );
}

export function getNodesWithToggledNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
  isExpanded: boolean,
) {
  return isExpanded
    ? getGraphWithCollapsedNode(nodes, edges, nodeId)
    : getNodesWithExpandedNode(nodes, edges, nodeId);
}
