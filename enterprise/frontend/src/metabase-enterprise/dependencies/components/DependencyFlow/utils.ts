import dagre from "@dagrejs/dagre";
import { createSelector } from "@reduxjs/toolkit";
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
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import { MAX_EXPANDED_ITEMS_PER_GROUP } from "./constants";
import type {
  EdgeId,
  GraphData,
  GroupNodeType,
  GroupType,
  ItemNodeType,
  NodeId,
  NodeType,
} from "./types";

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

function getNodeIds(nodes: NodeType[]): NodeId[] {
  return nodes.map((node) => node.id);
}

function getNodesById(nodes: NodeType[]) {
  const nodeBydId = new Map<NodeId, NodeType>();
  nodes.forEach((node) => nodeBydId.set(node.id, node));
  return nodeBydId;
}

function getEdgesByTargetId(edges: Edge[]) {
  const edgesByTargetId = new Map<NodeId, Edge[]>();

  edges.forEach((edge) => {
    let edgesGroup = edgesByTargetId.get(edge.target);
    if (edgesGroup == null) {
      edgesGroup = [];
      edgesByTargetId.set(edge.target, edgesGroup);
    }
    edgesGroup.push(edge);
  });

  return edgesByTargetId;
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

function getItemGraph(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): GraphData {
  return {
    nodes: getItemNodes(nodes),
    edges: getItemEdges(edges),
  };
}

function addGroupEdgesByTypeAndTargetId(
  nodeId: NodeId,
  nodeById: Map<NodeId, NodeType>,
  edgesByTargetId: Map<NodeId, Edge[]>,
  edgesByTypeAndTargetId: Map<NodeId, Map<GroupType, Edge[]>>,
) {
  const edges = edgesByTargetId.get(nodeId);

  edges?.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source == null || target == null || source.type !== "item") {
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

  edges?.forEach((edge) => {
    addGroupEdgesByTypeAndTargetId(
      edge.source,
      nodeById,
      edgesByTargetId,
      edgesByTypeAndTargetId,
    );
  });

  return edgesByTypeAndTargetId;
}

function getGroupEdgesByTypeAndTargetIdMap(
  nodes: NodeType[],
  edges: Edge[],
  entry: DependencyEntry,
) {
  const nodeId = getItemNodeId(entry.id, entry.type);
  const nodeById = getNodesById(nodes);
  const edgesByTargetId = getEdgesByTargetId(edges);
  const edgesByTypeAndTargetId = new Map<NodeId, Map<GroupType, Edge[]>>();

  addGroupEdgesByTypeAndTargetId(
    nodeId,
    nodeById,
    edgesByTargetId,
    edgesByTypeAndTargetId,
  );

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
      if (edgesGroup.length > MAX_EXPANDED_ITEMS_PER_GROUP) {
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

function getGroupGraph(
  nodes: NodeType[],
  edges: Edge[],
  entry: DependencyEntry,
): GraphData {
  const edgesByTypeAndTargetId = getGroupEdgesByTypeAndTargetIdMap(
    nodes,
    edges,
    entry,
  );
  const { groupNodes, newEdges, deletedEdgeIds } = getGroupNodesAndEdges(
    edgesByTypeAndTargetId,
  );
  const finalNodes = [...nodes, ...groupNodes];
  const finalEdges = [
    ...edges.filter((edge) => !deletedEdgeIds.has(edge.id)),
    ...newEdges,
  ];
  const groupNodeIds = getNodeIds(groupNodes);

  return {
    nodes: getNodesWithCollapsedNodes(finalNodes, finalEdges, groupNodeIds),
    edges: finalEdges,
  };
}

export function getInitialGraph(
  { nodes, edges }: DependencyGraph,
  entry: DependencyEntry,
): GraphData {
  const { nodes: itemNodes, edges: itemEdges } = getItemGraph(nodes, edges);
  return getGroupGraph(itemNodes, itemEdges, entry);
}

const getExpandedByNodeId = createSelector(
  (graph: GraphData) => graph.nodes,
  (graph: GraphData) => graph.edges,
  (nodes, edges) => {
    const nodeById = getNodesById(nodes);
    const edgesByTargetId = getEdgesByTargetId(edges);
    const expandedById = new Map<NodeId, boolean>();

    nodes.forEach((node) => {
      const targetEdges = edgesByTargetId.get(node.id) ?? [];
      const sourceNodes = targetEdges.map((edge) => nodeById.get(edge.source));
      const isExpanded = sourceNodes.every(
        (node) => node != null && !node.hidden,
      );
      expandedById.set(node.id, isExpanded);
    });

    return expandedById;
  },
);

export function isNodeExpanded(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const expandedById = getExpandedByNodeId({ nodes, edges });
  return expandedById.get(nodeId) ?? false;
}

function addDescendantNodes(
  nodeId: NodeId,
  edgesByTargetId: Map<NodeId, Edge[]>,
  nodeIds: Set<NodeId>,
) {
  const edges = edgesByTargetId.get(nodeId);
  edges?.forEach((edge) => {
    nodeIds.add(edge.source);
    addDescendantNodes(edge.source, edgesByTargetId, nodeIds);
  });
}

export function getNodesWithCollapsedNodes(
  nodes: NodeType[],
  edges: Edge[],
  nodeIds: NodeId[],
) {
  const edgesByTargetId = getEdgesByTargetId(edges);
  const newHiddenNodeIds = new Set<NodeId>();
  nodeIds.forEach((nodeId) =>
    addDescendantNodes(nodeId, edgesByTargetId, newHiddenNodeIds),
  );

  return nodes.map((node) =>
    newHiddenNodeIds.has(node.id) ? { ...node, hidden: true } : node,
  );
}

export function getNodesWithExpandedNodes(
  nodes: NodeType[],
  edges: Edge[],
  nodeIds: NodeId[],
) {
  const edgesByTargetId = getEdgesByTargetId(edges);
  const nodeEdges = nodeIds.flatMap(
    (nodeId) => edgesByTargetId.get(nodeId) ?? [],
  );
  const newVisibleNodeIds = new Set(nodeEdges.map((edge) => edge.source));

  return nodes.map((node) =>
    newVisibleNodeIds.has(node.id) ? { ...node, hidden: false } : node,
  );
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

export function getNodeLabel(node: DependencyNode) {
  return node.type === "table" ? node.data.display_name : node.data.name;
}

export function getNodeIcon(node: DependencyNode): IconName {
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
