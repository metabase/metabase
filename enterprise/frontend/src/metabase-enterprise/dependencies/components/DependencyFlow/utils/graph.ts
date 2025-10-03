import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyGraph,
  DependencyNode,
} from "metabase-types/api";

import S from "../DependencyFlow.module.css";
import { GROUP_ITEM_THRESHOLD } from "../constants";
import type { EdgeId, GroupData, GroupType, NodeId } from "../types";

import {
  getEdgeId,
  getGroupNodeId,
  getGroupType,
  getItemNodeId,
  getNodeByIdMap,
} from "./common";

function getItemNodes(nodes: DependencyNode[]): Node<DependencyNode>[] {
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
  nodeById: Map<NodeId, Node<DependencyNode>>,
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
  const groupNodes: Node<GroupData>[] = [];
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

function getGroupGraph(nodes: Node<DependencyNode>[], edges: Edge[]) {
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

export function getInitialNodesAndEdges({ nodes, edges }: DependencyGraph) {
  const { nodes: itemNodes, edges: itemEdges } = getItemGraph(nodes, edges);
  return getGroupGraph(itemNodes, itemEdges);
}
