import dagre from "@dagrejs/dagre";
import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { useLayoutEffect } from "react";

import {
  DAGRE_NODE_SEP,
  DAGRE_RANK_SEP,
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
} from "./constants";
import type { ErdFlowNode } from "./types";

function getNodesWithPositions(
  nodes: ErdFlowNode[],
  edges: { source: string; target: string }[],
): ErdFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP,
    ranksep: DAGRE_RANK_SEP,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const fieldCount = node.data.fields?.length ?? 0;
    const height = HEADER_HEIGHT + fieldCount * ROW_HEIGHT;
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height,
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
    };
  });
}

export function ErdNodeLayout() {
  const { getNodes, getEdges, setNodes, fitView } =
    useReactFlow<ErdFlowNode>();
  const isInitialized = useNodesInitialized();

  useLayoutEffect(() => {
    if (isInitialized) {
      const nodes = getNodes();
      const edges = getEdges();
      const newNodes = getNodesWithPositions(nodes, edges);
      setNodes(newNodes);
      fitView({ nodes: newNodes });
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
