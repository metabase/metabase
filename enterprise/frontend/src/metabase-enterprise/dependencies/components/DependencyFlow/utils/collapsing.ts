import type { Edge, Node } from "@xyflow/react";

import type { EdgeId, NodeId } from "../types";

import { getEdgesByTargetIdMap } from "./common";

function hideNodeSources(
  nodeId: NodeId,
  edgesByTargetId: Map<NodeId, Edge[]>,
  hiddenNodeIds: Set<NodeId>,
  hiddenEdgeIds: Set<EdgeId>,
) {
  const edges = edgesByTargetId.get(nodeId);
  edges?.forEach((edge) => {
    hiddenEdgeIds.add(edge.id);
    hiddenNodeIds.add(edge.source);
    hideNodeSources(edge.source, edgesByTargetId, hiddenNodeIds, hiddenEdgeIds);
  });
}

export function getGraphWithCollapsedNode(
  nodes: Node[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const hiddenNodeIds = new Set<NodeId>();
  const hiddenEdgeIds = new Set<EdgeId>();
  hideNodeSources(nodeId, edgesByTargetId, hiddenNodeIds, hiddenEdgeIds);

  return {
    nodes: nodes.map((node) =>
      hiddenNodeIds.has(node.id) ? { ...node, hidden: true } : node,
    ),
    edges: edges.map((edge) =>
      hiddenEdgeIds.has(edge.id) ? { ...edge, hidden: true } : edge,
    ),
  };
}
