import type { Edge, Node } from "@xyflow/react";

import type { EdgeId, NodeId } from "../types";

import { getEdgesByTargetIdMap } from "./common";

function hideNodeSources(
  nodeId: NodeId,
  edgesByTargetId: Map<NodeId, Edge[]>,
  collapsedNodeIds: Set<NodeId>,
  collapsedEdgeIds: Set<EdgeId>,
) {
  const edges = edgesByTargetId.get(nodeId);
  edges?.forEach((edge) => {
    collapsedEdgeIds.add(edge.id);
    collapsedNodeIds.add(edge.source);
    hideNodeSources(
      edge.source,
      edgesByTargetId,
      collapsedNodeIds,
      collapsedEdgeIds,
    );
  });
}

function getGraphWithCollapsedNode(
  nodes: Node[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const collapsedNodeIds = new Set<NodeId>();
  const collapsedEdgeIds = new Set<EdgeId>();
  hideNodeSources(nodeId, edgesByTargetId, collapsedNodeIds, collapsedEdgeIds);

  return {
    nodes: nodes.map((node) =>
      collapsedNodeIds.has(node.id) ? { ...node, hidden: true } : node,
    ),
    edges: edges.map((edge) =>
      collapsedEdgeIds.has(edge.id) ? { ...edge, hidden: true } : edge,
    ),
  };
}

function getGraphWithExpandedNode(
  nodes: Node[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const nodeEdges = edgesByTargetId.get(nodeId) ?? [];
  const expandedNodeIds = new Set(nodeEdges.map((edge) => edge.source));
  const expandedEdgeIds = new Set(nodeEdges.map((edge) => edge.id));

  return {
    nodes: nodes.map((node) =>
      expandedNodeIds.has(node.id) ? { ...node, hidden: false } : node,
    ),
    edges: edges.map((edge) =>
      expandedEdgeIds.has(edge.id) ? { ...edge, hidden: false } : edge,
    ),
  };
}

export function getGraphWithToggledNode(
  nodes: Node[],
  edges: Edge[],
  nodeId: NodeId,
  isExpanded: boolean,
) {
  return isExpanded
    ? getGraphWithCollapsedNode(nodes, edges, nodeId)
    : getGraphWithExpandedNode(nodes, edges, nodeId);
}
