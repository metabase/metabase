import type { Node } from "@xyflow/react";

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
