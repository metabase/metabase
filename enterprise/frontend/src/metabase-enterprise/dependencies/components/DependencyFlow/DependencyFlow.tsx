import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect } from "react";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { CustomNode } from "./CustomNode";
import { getGraphData } from "./utils";

const NODE_TYPES = {
  custom: CustomNode,
};

export function DependencyFlow() {
  const { data: graph = { nodes: [], edges: [] } } =
    useGetDependencyGraphQuery();
  const [nodes, setNodes, handleNodeChange] = useNodesState<Node>([]);
  const [edges, setEdges, handleEdgeChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const { nodes, edges } = getGraphData(graph);
    setNodes(nodes);
    setEdges(edges);
  }, [graph, setNodes, setEdges]);

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
