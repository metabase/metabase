// Block sizes and the dagre layout.

import dagre from "@dagrejs/dagre";
import type { XYPosition } from "@xyflow/react";

import type { BuilderEdge, BuilderNode, DockNodeType } from "../types";

import { isJoinNode, isResultNode, isUtilityNode } from "./nodes";

const TABLE_WIDTH = 288;

const JOIN_WIDTH = 384;

// Tables start collapsed to their header.
const TABLE_HEIGHT = 64;

const JOIN_HEIGHT = 300;

const RESULT_HEIGHT = 260;

const UTILITY_HEIGHT = 180;

// Size of a freshly dropped, still blank block, used to land it centred on
// the cursor before react-flow has measured it.
const DOCK_NODE_SIZES: Record<DockNodeType, { width: number; height: number }> =
  {
    table: { width: TABLE_WIDTH, height: 330 },
    join: { width: JOIN_WIDTH, height: 200 },
    expression: { width: TABLE_WIDTH, height: 200 },
    filter: { width: TABLE_WIDTH, height: 200 },
    summarize: { width: TABLE_WIDTH, height: 240 },
    sort: { width: TABLE_WIDTH, height: 180 },
    limit: { width: TABLE_WIDTH, height: 140 },
  };

// react-flow positions a node by its top-left corner; a drop should land the
// block's centre under the cursor.
export function centeredPosition(
  type: DockNodeType,
  cursor: XYPosition,
): XYPosition {
  const { width, height } = DOCK_NODE_SIZES[type];
  return { x: cursor.x - width / 2, y: cursor.y - height / 2 };
}

export function estimateSize(node: BuilderNode): {
  width: number;
  height: number;
} {
  if (isJoinNode(node)) {
    return { width: JOIN_WIDTH, height: JOIN_HEIGHT };
  }
  if (isResultNode(node)) {
    return { width: TABLE_WIDTH, height: RESULT_HEIGHT };
  }
  if (isUtilityNode(node)) {
    return { width: TABLE_WIDTH, height: UTILITY_HEIGHT };
  }
  return { width: TABLE_WIDTH, height: TABLE_HEIGHT };
}

// Left-to-right dagre layout. Measured sizes win once react-flow has them;
// the estimates cover the first paint.
export type NodeSize = { width: number; height: number };

export function layoutNodes(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  sizes?: Map<string, NodeSize>,
): BuilderNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: 48,
    ranksep: 110,
    marginx: 24,
    marginy: 24,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set(nodes.map((node) => node.id));
  nodes.forEach((node) => {
    const estimate = estimateSize(node);
    const size = sizes?.get(node.id);
    graph.setNode(node.id, {
      width: size?.width ?? node.measured?.width ?? estimate.width,
      height: size?.height ?? node.measured?.height ?? estimate.height,
    });
  });
  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const { x, y, width, height } = graph.node(node.id);
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}
