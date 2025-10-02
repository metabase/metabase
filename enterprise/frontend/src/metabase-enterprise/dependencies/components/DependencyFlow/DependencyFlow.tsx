import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useLayoutEffect } from "react";

import type { DependencyGraph } from "metabase-types/api";

import { EntityNode } from "./EntityNode";
import { getEdges, getNodes, getNodesWithPositions } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
};

const GRAPH: DependencyGraph = {
  nodes: [
    { id: 1, type: "table", data: { display_name: "some_intermediate_table" } },
    { id: 2, type: "table", data: { display_name: "nice_table" } },
    { id: 3, type: "table", data: { display_name: "ugly_table_here" } },
    { id: 4, type: "transform", data: { name: "Good transform" } },
    { id: 5, type: "transform", data: { name: "Better transform" } },
    { id: 6, type: "table", data: { display_name: "interesting_facts" } },
    { id: 7, type: "table", data: { display_name: "another_thing" } },
    { id: 8, type: "card", data: { name: "Amazing Accounts", type: "model" } },
  ],
  edges: [
    {
      from_entity_id: 4,
      from_entity_type: "transform",
      to_entity_id: 1,
      to_entity_type: "table",
    },
    {
      from_entity_id: 4,
      from_entity_type: "transform",
      to_entity_id: 2,
      to_entity_type: "table",
    },
    {
      from_entity_id: 5,
      from_entity_type: "transform",
      to_entity_id: 3,
      to_entity_type: "table",
    },
    {
      from_entity_id: 6,
      from_entity_type: "table",
      to_entity_id: 4,
      to_entity_type: "transform",
    },
    {
      from_entity_id: 7,
      from_entity_type: "table",
      to_entity_id: 5,
      to_entity_type: "transform",
    },
    {
      from_entity_id: 8,
      from_entity_type: "card",
      to_entity_id: 6,
      to_entity_type: "table",
    },
    {
      from_entity_id: 8,
      from_entity_type: "card",
      to_entity_id: 7,
      to_entity_type: "table",
    },
  ],
};

export function DependencyFlow() {
  const [nodes, _setNodes, onNodesChange] = useNodesState(
    getNodes(GRAPH.nodes, GRAPH.edges),
  );
  const [edges, _setEdges, onEdgesChange] = useEdgesState(
    getEdges(GRAPH.edges),
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
    >
      <Background />
      <Controls />
      <NodeLayout />
    </ReactFlow>
  );
}

function NodeLayout() {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow();
  const isInitialized = useNodesInitialized();

  useLayoutEffect(() => {
    if (isInitialized) {
      const nodes = getNodes();
      const edges = getEdges();
      const nodesWithPositions = getNodesWithPositions(nodes, edges);
      setNodes(nodesWithPositions);
      fitView({ nodes: nodesWithPositions });
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
