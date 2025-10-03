import type { Edge } from "@xyflow/react";

import type { NodeId, NodeType } from "../types";

export function getNodeByIdMap<T extends NodeType>(nodes: T[]) {
  const nodeBydId = new Map<NodeId, T>();
  nodes.forEach((node) => nodeBydId.set(node.id, node));
  return nodeBydId;
}

export function getEdgesByTargetIdMap(edges: Edge[]) {
  const edgesByTargetId = new Map<NodeId, Edge[]>();
  edges.forEach((edge) => {
    let edgesGroup = edgesByTargetId.get(edge.target);
    if (edgesGroup == null) {
      edgesGroup = [];
      edgesByTargetId.set(edge.target, edgesGroup);
    }
    edgesGroup.push(edge);
  });
  return edgesByTargetId;
}
