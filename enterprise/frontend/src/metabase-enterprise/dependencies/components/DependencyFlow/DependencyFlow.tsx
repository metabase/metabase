import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useState } from "react";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { EntityGroupNode } from "./EntityGroupNode";
import { EntityNode } from "./EntityNode";
import type { DependencyGroup, GraphNode, NodeId } from "./types";
import { getGraphInfo, getNodeId } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
  "entity-group": EntityGroupNode,
};

export function DependencyFlow() {
  const { data: graph = { nodes: [], edges: [] } } =
    useGetDependencyGraphQuery();
  const [nodes, setNodes, handleNodeChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, handleEdgeChange] = useEdgesState<Edge>([]);
  const [visibleNodeIds, setVisibleNodeIds] = useState(new Set<NodeId>());

  useEffect(() => {
    const { nodes, edges } = getGraphInfo(graph, visibleNodeIds);
    setNodes(nodes);
    setEdges(edges);
  }, [graph, visibleNodeIds, setNodes, setEdges]);

  const handleNodeClick = (_event: unknown, node: Node) => {
    const group = (node.data as DependencyGroup)?.nodes ?? [];
    setVisibleNodeIds(
      new Set([
        ...visibleNodeIds,
        ...group.slice(0, 10).map((node) => getNodeId(node.id, node.type)),
      ]),
    );
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
      onNodesChange={handleNodeChange}
      onEdgesChange={handleEdgeChange}
      onNodeClick={handleNodeClick}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
