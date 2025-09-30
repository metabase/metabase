import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyEdge,
  DependencyEntityId,
  DependencyEntityType,
  DependencyGraph,
  DependencyNode,
} from "metabase-types/api";

import S from "./DependencyFlow.module.css";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import {
  DependencyGroupType,
  EntityGroupNode,
  EntityNode,
  GraphInfo,
  NodeId,
} from "./types";

function getId(id: DependencyEntityId, type: DependencyEntityType): NodeId {
  return `${type}-${id}`;
}

function getNodeId(node: DependencyNode): NodeId {
  return getId(node.id, node.type);
}

function getEntityNodes(nodes: DependencyNode[]): Node[] {
  return nodes.map((node) => ({
    id: getNodeId(node),
    className: S.node,
    type: "entity",
    data: node,
    position: { x: 0, y: 0 },
  }));
}

function getEntityEdges(edges: DependencyEdge[]): Edge[] {
  return edges.map((edge) => {
    const sourceId = getId(edge.from_entity_id, edge.from_entity_type);
    const targetId = getId(edge.to_entity_id, edge.to_entity_type);

    return {
      id: `${sourceId}-${targetId}`,
      data: edge,
      source: sourceId,
      target: targetId,
    };
  });
}

function addEntityNodes(graph: DependencyGraph): GraphInfo {
  const nodes = getEntityNodes(graph.nodes);
  const edges = getEntityEdges(graph.edges);

  return {
    nodes,
    edges,
  };
}

function getGroupNodeType(node: DependencyNode) {
  return node.type === "card" ? node.entity.type : node.type;
}

function addGroupNodes(
  nodes: EntityNode[],
  edges: Edge[],
  visibleNodeIds: Set<NodeId>,
) {
  const nodeBydId = new Map<NodeId, EntityNode>();
  nodes.forEach((node) => {
    nodeBydId.set(node.id, node);
  });

  const groupById = new Map<
    NodeId,
    Map<DependencyGroupType, DependencyNode[]>
  >();
  edges.forEach((edge) => {
    if (visibleNodeIds.has(edge.source) && !visibleNodeIds.has(edge.target)) {
      const target = nodeBydId.get(edge.target);
      if (target == null) {
        return;
      }

      let groupByType = groupById.get(edge.source);
      if (groupByType == null) {
        groupByType = new Map<DependencyGroupType, DependencyNode[]>();
        groupById.set(edge.source, groupByType);
      }

      const groupType = getGroupNodeType(target.data);
      let group = groupByType.get(groupType);
      if (group == null) {
        group = [];
        groupByType.set(groupType, group);
      }
      group.push(target.data);
    }
  });

  const groupNodes: EntityGroupNode[] = [];
  groupById.forEach((groupByType) => {
    groupByType.forEach((nodes, type) => {
      groupNodes.push({
        id: "",
        type: "entity-group",
        position: { x: 0, y: 0 },
        data: { type, nodes },
      });
    });
  });

  return {
    nodes: [...nodes, ...groupNodes],
    edges,
  };
}

function addNodePositions({ nodes, edges }: GraphInfo): GraphInfo {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({ rankdir: "RL" });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const { x, y, width, height } = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: x - width / 2,
          y: y - height / 2,
        },
      };
    }),
    edges,
  };
}
