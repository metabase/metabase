import type { Edge } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyGraph,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

import S from "../DependencyFlow.module.css";
import { GROUP_ITEM_THRESHOLD } from "../constants";
import type {
  EdgeId,
  GroupNodeType,
  GroupType,
  ItemNodeType,
  NodeId,
} from "../types";

import { getNodeByIdMap } from "./common";

export function getItemNodeId(id: DependencyId, type: DependencyType): NodeId {
  return `${type}-${id}`;
}

export function getGroupNodeId(nodeId: NodeId, type: GroupType): NodeId {
  return `${nodeId}-${type}`;
}

export function getEdgeId(sourceId: NodeId, targetId: NodeId): EdgeId {
  return `${sourceId}-${targetId}`;
}

export function getGroupType(node: DependencyNode): GroupType {
  return node.type === "card" ? node.data.type : node.type;
}

function getItemNodes(nodes: DependencyNode[]): ItemNodeType[] {
  return nodes.map((node) => {
    const nodeId = getItemNodeId(node.id, node.type);

    return {
      id: nodeId,
      className: S.item,
      type: "item",
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

function getEdgesByTypeAndTargetIdMap(
  nodeById: Map<NodeId, ItemNodeType>,
  edges: Edge[],
) {
  const edgesByTypeAndTargetId = new Map<NodeId, Map<GroupType, Edge[]>>();

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source == null || target == null) {
      return;
    }

    let edgesByType = edgesByTypeAndTargetId.get(edge.target);
    if (edgesByType == null) {
      edgesByType = new Map<GroupType, Edge[]>();
      edgesByTypeAndTargetId.set(edge.target, edgesByType);
    }

    const groupType = getGroupType(source.data);
    let edgesGroup = edgesByType.get(groupType);
    if (edgesGroup == null) {
      edgesGroup = [];
      edgesByType.set(groupType, edgesGroup);
    }

    edgesGroup.push(edge);
  });

  return edgesByTypeAndTargetId;
}

function getGroupNodesAndEdges(
  edgesByTypeAndTargetId: Map<NodeId, Map<GroupType, Edge[]>>,
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
          type: "item-group",
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

export function getInitialGraph({ nodes, edges }: DependencyGraph) {
  const { nodes: itemNodes, edges: itemEdges } = getItemGraph(nodes, edges);
  return getGroupGraph(itemNodes, itemEdges);
}
