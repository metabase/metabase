import dagre from "@dagrejs/dagre";
import type { Edge, HandleType, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import type { NodeId } from "./types";

function getNodeId(id: DependencyEntityId, type: DependencyEntityType): NodeId {
  return `${type}-${id}`;
}

function getNodeBydId(nodes: DependencyNode[]) {
  const nodeById = new Map<NodeId, DependencyNode>();
  nodes.forEach((node) => nodeById.set(getNodeId(node.id, node.type), node));
  return nodeById;
}

function getEdgeIdById(edges: DependencyEdge[], type: HandleType) {
  const startIdsByEndId = new Map<NodeId, NodeId[]>();

  edges.forEach((edge) => {
    const sourceId = getNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getNodeId(edge.to_entity_id, edge.to_entity_type);
    const startId = type === "source" ? sourceId : targetId;
    const endId = type === "source" ? targetId : sourceId;

    let startIds = startIdsByEndId.get(endId);
    if (startIds == null) {
      startIds = [];
      startIdsByEndId.set(endId, startIds);
    }

    startIds.push(startId);
  });

  return startIdsByEndId;
}

export function getNodes(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): Node[] {
  const nodeById = getNodeBydId(nodes);
  const sourceIdsByTargetId = getEdgeIdById(edges, "target");
  const targetIdsBySourceId = getEdgeIdById(edges, "source");

  return nodes.map((node) => {
    const nodeId = getNodeId(node.id, node.type);
    const sourceIds = sourceIdsByTargetId.get(nodeId) ?? [];
    const targetIds = targetIdsBySourceId.get(nodeId) ?? [];

    return {
      id: nodeId,
      className: S.node,
      type: "entity",
      data: {
        node,
        sources: sourceIds.map((nodeId) => nodeById.get(nodeId)),
        targets: targetIds.map((nodeId) => nodeById.get(nodeId)),
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
      focusable: false,
      selectable: false,
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
