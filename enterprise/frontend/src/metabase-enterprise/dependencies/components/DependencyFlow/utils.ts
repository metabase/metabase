import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyGraph,
  DependencyNode,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import type { EntityNode, GraphInfo, GraphNode, NodeId } from "./types";

export function getNodeId(
  id: DependencyEntityId,
  type: DependencyEntityType,
): NodeId {
  return `${type}-${id}`;
}

function getEntityNodes(
  nodes: DependencyNode[],
  selectedId?: DependencyEntityId,
  selectedType?: DependencyEntityType,
): EntityNode[] {
  return nodes.map((node) => ({
    id: getNodeId(node.id, node.type),
    className: S.node,
    type: "entity",
    data: node,
    position: { x: 0, y: 0 },
    selected: node.id === selectedId && node.type === selectedType,
    connectable: false,
  }));
}

function getEntityEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: `${sourceId}-${targetId}`,
      data: edge,
      source: sourceId,
      target: targetId,
    };
  });
}

function getNodesWithPositions(nodes: GraphNode[], edges: Edge[]): GraphNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({ rankdir: "LR" });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
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

export function getGraphInfo(
  graph: DependencyGraph,
  selectedId?: DependencyEntityId,
  selectedType?: DependencyEntityType,
): GraphInfo {
  const entityNodes = getEntityNodes(graph.nodes, selectedId, selectedType);
  const entityEdges = getEntityEdges(graph.edges);

  return {
    nodes: getNodesWithPositions(entityNodes, entityEdges),
    edges: entityEdges,
  };
}
