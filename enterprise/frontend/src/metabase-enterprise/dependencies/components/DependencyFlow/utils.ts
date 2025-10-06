import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";

import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  DependencyEdge,
  DependencyEntry,
  DependencyGraph,
  DependencyId,
  DependencyNode,
  DependencyType,
  DependentNode,
} from "metabase-types/api";

import type { EdgeId, GraphData, NodeId, NodeType } from "./types";

function getNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${type}-${id}`;
}

function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

function getNodes(nodes: DependencyNode[], entry: DependencyEntry): NodeType[] {
  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);

    return {
      id: nodeId,
      type: "node",
      data: node,
      position: { x: 0, y: 0 },
      selected: node.id === entry.id && node.type === entry.type,
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
      data: edge,
      source: sourceId,
      target: targetId,
      focusable: false,
      selectable: false,
      deletable: false,
    };
  });
}

export function getInitialGraph(
  { nodes, edges }: DependencyGraph,
  entry: DependencyEntry,
): GraphData {
  return {
    nodes: getNodes(nodes, entry),
    edges: getEdges(edges),
  };
}

export function getNodesWithPositions(
  nodes: NodeType[],
  edges: Edge[],
): NodeType[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({ rankdir: "LR" });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.measured?.width,
      height: node.measured?.height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.target, edge.source);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const { x, y, width, height } = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
    };
  });
}

export function getNodeLabel(node: DependencyNode | DependentNode) {
  return node.type === "table" ? node.data.display_name : node.data.name;
}

export function getNodeIcon(node: DependencyNode | DependentNode): IconName {
  switch (node.type) {
    case "card":
      switch (node.data.type) {
        case "question":
          return visualizations.get(node.data.display)?.iconName ?? "table2";
        case "model":
          return "model";
        case "metric":
          return "metric";
        default:
          return "unknown";
      }
    case "table":
      return "table";
    case "snippet":
      return "sql";
    case "transform":
      return "refresh_downstream";
    default:
      return "unknown";
  }
}
