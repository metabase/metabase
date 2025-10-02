import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";

function getNodeId(id: DependencyEntityId, type: DependencyEntityType) {
  return `${type}-${id}`;
}

export function getNodes(nodes: DependencyNode[]): Node[] {
  return nodes.map((node) => ({
    id: getNodeId(node.id, node.type),
    className: S.node,
    type: "entity",
    data: node,
    position: { x: 0, y: 0 },
    connectable: false,
    draggable: false,
    deletable: false,
  }));
}

export function getEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: `${sourceId}-${targetId}`,
      data: edge,
      source: sourceId,
      target: targetId,
      deletable: false,
    };
  });
}

export function getNodesWithPositions(nodes: Node[], edges: Edge[]): Node[] {
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
