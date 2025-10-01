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
import type {
  DependencyGroupType,
  EntityGroupNode,
  EntityNode,
  GraphInfo,
  GraphNode,
  NodeId,
} from "./types";

export function getNodeId(
  id: DependencyEntityId,
  type: DependencyEntityType,
): NodeId {
  return `${type}-${id}`;
}

function getGroupId(parentId: NodeId, groupType: DependencyGroupType) {
  return `${parentId}-${groupType}`;
}

function getEntityNodes(nodes: DependencyNode[]): EntityNode[] {
  return nodes.map((node) => ({
    id: getNodeId(node.id, node.type),
    className: S.node,
    type: "entity",
    data: node,
    position: { x: 0, y: 0 },
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

function getRealVisibleNodeIds(
  nodes: EntityNode[],
  edges: Edge[],
  visibleNodeIds: Set<NodeId>,
) {
  const allSourceNodeIds = new Set(edges.map((edge) => edge.source));
  return new Set([
    ...nodes
      .filter((node) => !allSourceNodeIds.has(node.id))
      .map((node) => node.id),
    ...visibleNodeIds,
  ]);
}

function getVisibleNodes(
  nodes: EntityNode[],
  visibleNodeIds: Set<NodeId>,
): EntityNode[] {
  return nodes.filter((node) => visibleNodeIds.has(node.id));
}

function getVisibleEdges(edges: Edge[], visibleNodeIds: Set<NodeId>): Edge[] {
  return edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );
}

function getGroupNodeType(node: DependencyNode) {
  return node.type === "card" ? node.data.type : node.type;
}

function getGroupMapping(
  nodes: EntityNode[],
  edges: Edge[],
  visibleNodeIds: Set<NodeId>,
): Map<NodeId, Map<DependencyGroupType, DependencyNode[]>> {
  const nodeBydId = new Map<NodeId, EntityNode>();
  nodes.forEach((node) => {
    nodeBydId.set(node.id, node);
  });

  const groupById = new Map<
    NodeId,
    Map<DependencyGroupType, DependencyNode[]>
  >();
  edges.forEach((edge) => {
    if (!visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) {
      const source = nodeBydId.get(edge.source);
      if (source == null) {
        return;
      }

      let groupByType = groupById.get(edge.target);
      if (groupByType == null) {
        groupByType = new Map<DependencyGroupType, DependencyNode[]>();
        groupById.set(edge.target, groupByType);
      }

      const groupType = getGroupNodeType(source.data);
      let group = groupByType.get(groupType);
      if (group == null) {
        group = [];
        groupByType.set(groupType, group);
      }
      group.push(source.data);
    }
  });

  return groupById;
}

function getGroupNodes(
  groupMapping: Map<NodeId, Map<DependencyGroupType, DependencyNode[]>>,
): EntityGroupNode[] {
  const groupNodes: EntityGroupNode[] = [];
  groupMapping.forEach((groupByType, parentId) => {
    groupByType.forEach((nodes, type) => {
      groupNodes.push({
        id: getGroupId(parentId, type),
        type: "entity-group",
        className: S.node,
        position: { x: 0, y: 0 },
        data: { type, nodes },
      });
    });
  });
  return groupNodes;
}

function getGroupEdges(
  groupMapping: Map<NodeId, Map<DependencyGroupType, DependencyNode[]>>,
): Edge[] {
  const groupEdges: Edge[] = [];
  groupMapping.forEach((groupByType, parentId) => {
    groupByType.forEach((nodes, type) => {
      const groupId = getGroupId(parentId, type);
      groupEdges.push({
        id: `${parentId}-${groupId}`,
        source: groupId,
        target: parentId,
      });
    });
  });
  return groupEdges;
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
  visibleNodeIds: Set<NodeId>,
): GraphInfo {
  const entityNodes = getEntityNodes(graph.nodes);
  const entityEdges = getEntityEdges(graph.edges);
  const realVisibleNodeIds = getRealVisibleNodeIds(
    entityNodes,
    entityEdges,
    visibleNodeIds,
  );

  const groupMapping = getGroupMapping(
    entityNodes,
    entityEdges,
    realVisibleNodeIds,
  );
  const groupNodes = getGroupNodes(groupMapping);
  const groupEdges = getGroupEdges(groupMapping);

  const visibleNodes = [
    ...getVisibleNodes(entityNodes, realVisibleNodeIds),
    ...groupNodes,
  ];
  const visibleEdges = [
    ...getVisibleEdges(entityEdges, realVisibleNodeIds),
    ...groupEdges,
  ];

  return {
    nodes: getNodesWithPositions(visibleNodes, visibleEdges),
    edges: visibleEdges,
  };
}
