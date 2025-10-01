import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect } from "react";

import * as Urls from "metabase/lib/urls";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntityType } from "metabase-types/api";

import { EntityGroupNode } from "./EntityGroupNode";
import { EntityNode } from "./EntityNode";
import type { GraphNode } from "./types";
import { getGraphInfo } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
  "entity-group": EntityGroupNode,
};

type DependencyFlowParams = {
  id: string;
  type: DependencyEntityType;
};

type DependencyFlowProps = {
  params: DependencyFlowParams;
};

export function DependencyFlow({ params }: DependencyFlowProps) {
  const id = Urls.extractEntityId(params.id)!;
  const type = params.type;
  const { data: graph = { nodes: [], edges: [] } } = useGetDependencyGraphQuery(
    { id, type },
  );
  const [nodes, setNodes, handleNodeChange] = useNodesState<GraphNode>([]);
  const [edges, setEdges, handleEdgeChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const { nodes, edges } = getGraphInfo(graph);
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
