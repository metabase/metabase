import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

import type { EdgeId, GroupType, NodeId } from "../types";

export function getItemNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${type}-${id}`;
}

export function getGroupNodeId(nodeId: NodeId, type: GroupType): NodeId {
  return `${nodeId}-${type}`;
}

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

export function getGroupType(node: DependencyNode): GroupType {
  return node.type === "card" ? node.data.type : node.type;
}

export function getNodeByIdMap<T extends Node["data"]>(nodes: Node<T>[]) {
  const nodeBydId = new Map<NodeId, Node<T>>();
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
