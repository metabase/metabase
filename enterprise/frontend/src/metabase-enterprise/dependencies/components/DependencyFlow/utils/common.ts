import type { NodeId, NodeType } from "../types";

export function getNodeByIdMap(nodes: NodeType[]) {
  const nodeBydId = new Map<NodeId, NodeType>();
  nodes.forEach((node) => nodeBydId.set(node.id, node));
  return nodeBydId;
}
