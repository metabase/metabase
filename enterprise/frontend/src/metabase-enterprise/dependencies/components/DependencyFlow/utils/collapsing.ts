import { createSelector } from "@reduxjs/toolkit";
import type { Edge } from "@xyflow/react";

import type { GraphData, NodeId, NodeType } from "../types";

import { getNodeByIdMap } from "./common";

const getEdgesByTargetIdMap = createSelector(
  (edges: Edge[]) => edges,
  (edges) => {
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
  },
);

const getExpandedByNodeIdMap = createSelector(
  (graph: GraphData) => graph.nodes,
  (graph: GraphData) => graph.edges,
  (nodes, edges) => {
    const nodeById = getNodeByIdMap(nodes);
    const edgesByTargetId = getEdgesByTargetIdMap(edges);
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
  const expandedById = getExpandedByNodeIdMap({ nodes, edges });
  return expandedById.get(nodeId) ?? false;
}

function hideNodeSources(
  nodeId: NodeId,
  edgesByTargetId: Map<NodeId, Edge[]>,
  collapsedNodeIds: Set<NodeId>,
) {
  const edges = edgesByTargetId.get(nodeId);
  edges?.forEach((edge) => {
    collapsedNodeIds.add(edge.source);
    hideNodeSources(edge.source, edgesByTargetId, collapsedNodeIds);
  });
}

function getGraphWithCollapsedNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const collapsedNodeIds = new Set<NodeId>();
  hideNodeSources(nodeId, edgesByTargetId, collapsedNodeIds);

  return nodes.map((node) =>
    collapsedNodeIds.has(node.id) ? { ...node, hidden: true } : node,
  );
}

function getNodesWithExpandedNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
) {
  const edgesByTargetId = getEdgesByTargetIdMap(edges);
  const nodeEdges = edgesByTargetId.get(nodeId) ?? [];
  const expandedNodeIds = new Set(nodeEdges.map((edge) => edge.source));

  return nodes.map((node) =>
    expandedNodeIds.has(node.id) ? { ...node, hidden: false } : node,
  );
}

export function getNodesWithToggledNode(
  nodes: NodeType[],
  edges: Edge[],
  nodeId: NodeId,
  isExpanded: boolean,
) {
  return isExpanded
    ? getGraphWithCollapsedNode(nodes, edges, nodeId)
    : getNodesWithExpandedNode(nodes, edges, nodeId);
}
