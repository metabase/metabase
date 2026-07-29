import dagre from "@dagrejs/dagre";

import { NODE_WIDTH_PX } from "../../constants";
import type { SchemaViewerFlowNode } from "../../types";
import { getNodeHeight } from "../flow-graph";

import { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./constants";
import type { LayoutEdge } from "./types";

/**
 * Runs a full Dagre pass and converts center-based Dagre coordinates into
 * React Flow's top-left node positions.
 */
export function layoutWithDagre(
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): SchemaViewerFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP_PX,
    ranksep: DAGRE_RANK_SEP_PX,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH_PX,
      height: getNodeHeight(node.data.fields?.length ?? 0),
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
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
      // Sync dimensions with React Flow's internal state
      style: {
        ...node.style,
        width,
        height,
        opacity: 1, // Show after positioning
      },
    };
  });
}
