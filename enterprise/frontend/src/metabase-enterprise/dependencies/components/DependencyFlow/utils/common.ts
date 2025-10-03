import type { NodeId, NodeType } from "../types";

export function getNodeByIdMap<T extends NodeType>(nodes: T[]) {
  const nodeBydId = new Map<NodeId, T>();
  nodes.forEach((node) => nodeBydId.set(node.id, node));
  return nodeBydId;
}
