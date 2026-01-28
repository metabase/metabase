import type { Edge } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DependencyNode,
  WorkspaceDependencyGraph,
  WorkspaceGraphDependencyEdge,
  WorkspaceGraphDependencyNode,
} from "metabase-types/api";

import type { NodeId } from "../../types";
import { getNodeId, isSameNode } from "../../utils";

import type { EdgeId, GraphData, NodeType } from "./types";

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

type AnyDependencyNode = DependencyNode | WorkspaceGraphDependencyNode;
type AnyDependencyEdge = DependencyEdge | WorkspaceGraphDependencyEdge;

function getNodes(nodes: AnyDependencyNode[]): NodeType[] {
  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);

    return {
      id: nodeId,
      type: "node",
      data: node as DependencyNode, // Cast for NodeType compatibility
      position: { x: 0, y: 0 },
      draggable: false,
      deletable: false,
    };
  });
}

function getEdges(edges: AnyDependencyEdge[]): Edge[] {
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

export function getInitialGraph({
  nodes,
  edges,
}: DependencyGraph | WorkspaceDependencyGraph): GraphData {
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
