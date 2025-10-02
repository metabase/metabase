import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import { isNotNull } from "metabase/lib/types";
import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import type { NodeData, NodeId } from "./types";

function getNodeId(id: DependencyEntityId, type: DependencyEntityType): NodeId {
  return `${type}-${id}`;
}

export function getNodes(nodes: DependencyNode[]): Node<NodeData>[] {
  return nodes.map((node) => {
    return {
      id: getNodeId(node.id, node.type),
      className: S.node,
      type: "entity",
      data: {
        node,
        sources: [],
      },
      position: { x: 0, y: 0 },
      connectable: false,
      draggable: false,
      deletable: false,
    };
  });
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

function getNodeBydId(nodes: Node<NodeData>[]) {
  const nodeById = new Map<NodeId, Node<NodeData>>();
  nodes.forEach((node) => nodeById.set(node.id, node));
  return nodeById;
}

function getSourceIdsByTargetId(edges: Edge[]) {
  const sourceIdsByTargetId = new Map<NodeId, NodeId[]>();

  edges.forEach((edge) => {
    let sourceIds = sourceIdsByTargetId.get(edge.target);
    if (sourceIds == null) {
      sourceIds = [];
      sourceIdsByTargetId.set(edge.target, sourceIds);
    }
    sourceIds.push(edge.source);
  });

  return sourceIdsByTargetId;
}

export function getNodesWithSources(
  nodes: Node<NodeData>[],
  edges: Edge[],
): Node<NodeData>[] {
  const nodeById = getNodeBydId(nodes);
  const sourceIdsByTargetId = getSourceIdsByTargetId(edges);

  return nodes.map((node) => {
    const sourceIds = sourceIdsByTargetId.get(node.id) ?? [];
    const sources = sourceIds
      .map((nodeId) => nodeById.get(nodeId)?.data.node)
      .filter(isNotNull);
    return {
      ...node,
      data: {
        ...node.data,
        sources,
      },
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
