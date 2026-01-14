import type { Edge } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DependencyNode,
} from "metabase-types/api";

import type { NodeId } from "../../types";
import { getNodeId, isSameNode } from "../../utils";

import type { EdgeId, GraphData, NodeType } from "./types";

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

function getNodes(nodes: DependencyNode[]): NodeType[] {
  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);

    return {
      id: nodeId,
      type: "node",
      data: node,
      position: { x: 0, y: 0 },
      draggable: false,
      deletable: false,
    };
  });
}

function getEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: getEdgeId(sourceId, targetId),
      type: "edge",
      data: edge,
      source: sourceId,
      target: targetId,
      selectable: false,
      deletable: false,
    };
  });
}

export function getInitialGraph({ nodes, edges }: DependencyGraph): GraphData {
  return {
    nodes: getNodes(nodes),
    edges: getEdges(edges),
  };
}

export function findNode(
  nodes: NodeType[],
  entry: DependencyEntry,
): NodeType | undefined {
  return nodes.find((node) => isSameNode(node.data, entry));
}
