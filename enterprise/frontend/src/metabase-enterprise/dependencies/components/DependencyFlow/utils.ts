import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import {
  GROUP_ITEM_THRESHOLD,
  GROUP_NODE_TYPE,
  ITEM_NODE_TYPE,
} from "./constants";
import type {
  EdgeId,
  Graph,
  GroupNodeType,
  ItemNodeType,
  NodeId,
} from "./types";

function getItemNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${type}-${id}`;
}

function getGroupNodeId(nodeId: NodeId, type: DependencyType): NodeId {
  return `${nodeId}-${type}`;
}

function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

function getItemNodes(nodes: DependencyNode[]): ItemNodeType[] {
  return nodes.map((node) => {
    const nodeId = getItemNodeId(node.id, node.type);

    return {
      id: nodeId,
      className: S.item,
      type: ITEM_NODE_TYPE,
      data: node,
      position: { x: 0, y: 0 },
      connectable: false,
      draggable: false,
      deletable: false,
    };
  });
}

function getItemEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getItemNodeId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getItemNodeId(edge.to_entity_id, edge.to_entity_type);

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

function getItemGraph(nodes: DependencyNode[], edges: DependencyEdge[]) {
  return {
    nodes: getItemNodes(nodes),
    edges: getItemEdges(edges),
  };
}

function getNodeByIdMap(nodes: ItemNodeType[]) {
  const nodeBydId = new Map<NodeId, ItemNodeType>();
  nodes.forEach((node) => nodeBydId.set(node.id, node));
  return nodeBydId;
}

function getEdgesByTypeAndTargetIdMap(
  nodeById: Map<NodeId, ItemNodeType>,
  edges: Edge[],
) {
  const edgesByTypeAndTargetId = new Map<NodeId, Map<DependencyType, Edge[]>>();

  edges.forEach((edge) => {
    const node = nodeById.get(edge.target);
    if (node == null) {
      return;
    }

    let edgesByType = edgesByTypeAndTargetId.get(edge.target);
    if (edgesByType == null) {
      edgesByType = new Map<DependencyType, Edge[]>();
      edgesByTypeAndTargetId.set(edge.target, edgesByType);
    }

    const nodeType = node.data.type;
    let edgesGroup = edgesByType.get(nodeType);
    if (edgesGroup == null) {
      edgesGroup = [];
      edgesByType.set(node.data.type, edgesGroup);
    }

    edgesGroup.push(edge);
  });

  return edgesByTypeAndTargetId;
}

function getGroupNodesAndEdges(
  edgesByTypeAndTargetId: Map<NodeId, Map<DependencyType, Edge[]>>,
) {
  const groupNodes: GroupNodeType[] = [];
  const newEdges: Edge[] = [];
  const deletedEdgeIds = new Set<EdgeId>();

  edgesByTypeAndTargetId.forEach((edgesByType, targetId) => {
    edgesByType.forEach((edgesGroup, type) => {
      if (edgesGroup.length > GROUP_ITEM_THRESHOLD) {
        const groupId = getGroupNodeId(targetId, type);
        groupNodes.push({
          id: groupId,
          className: S.group,
          type: GROUP_NODE_TYPE,
          data: { type, count: edgesGroup.length },
          position: { x: 0, y: 0 },
        });
        newEdges.push({
          id: getEdgeId(groupId, targetId),
          source: groupId,
          target: targetId,
        });
        edgesGroup.forEach((edge) => {
          newEdges.push({
            id: getEdgeId(edge.source, groupId),
            source: edge.source,
            target: groupId,
          });
          deletedEdgeIds.add(edge.id);
        });
      }
    });
  });

  return { groupNodes, newEdges, deletedEdgeIds };
}

function getGroupGraph(nodes: ItemNodeType[], edges: Edge[]) {
  const nodeById = getNodeByIdMap(nodes);
  const edgesByTypeAndTargetId = getEdgesByTypeAndTargetIdMap(nodeById, edges);
  const { groupNodes, newEdges, deletedEdgeIds } = getGroupNodesAndEdges(
    edgesByTypeAndTargetId,
  );

  return {
    nodes: [...nodes, ...groupNodes],
    edges: [
      ...edges.filter((edge) => !deletedEdgeIds.has(edge.id)),
      ...newEdges,
    ],
  };
}

export function getGraph(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): Graph {
  const { nodes: itemNodes, edges: itemEdges } = getItemGraph(nodes, edges);
  return getGroupGraph(itemNodes, itemEdges);
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
