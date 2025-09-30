import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useState } from "react";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { EntityGroupNode } from "./EntityGroupNode";
import { EntityNode } from "./EntityNode";
import type { GraphNode, NodeId } from "./types";
import { getGraphInfo } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
  "entity-group": EntityGroupNode,
};

export function DependencyFlow() {
  const { data: graph = { nodes: [], edges: [] } } =
    useGetDependencyGraphQuery();
  const [nodes, setNodes, handleNodeChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, handleEdgeChange] = useEdgesState<Edge>([]);
  const [visibleNodeIds, _setVisibleNodeIds] = useState(
    new Set<NodeId>(["table-11"]),
  );

  useEffect(() => {
    const { nodes, edges } = getGraphInfo(graph, visibleNodeIds);
    setNodes(nodes);
    setEdges(edges);
  }, [graph, visibleNodeIds, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
      minZoom={0.001}
      maxZoom={1000}
      onNodesChange={handleNodeChange}
      onEdgesChange={handleEdgeChange}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
