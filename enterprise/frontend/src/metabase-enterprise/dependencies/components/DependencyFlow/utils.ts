import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

import { NODE_HEIGHT, NODE_WIDTH } from "./constants";

function getNodeId(id: DependencyEntityId, type: DependencyEntityType): string {
  return `${type}-${id}`;
}

export function getNodes(nodes: DependencyNode[]): Node[] {
  return nodes.map((node) => ({
    id: getNodeId(node.id, node.type),
    data: node,
    position: { x: 0, y: 0 },
  }));
}

export function getEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
    };
  });
}

export function getNodesWithPosition(nodes: Node[], edges: Edge[]): Node[] {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
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
