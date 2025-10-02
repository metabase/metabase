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
    { id: 1, type: "table", data: { display_name: "Orders" } },
    { id: 1, type: "card", data: { name: "Count of Orders", type: "model" } },
  ],
  edges: [
    {
      from_entity_id: 1,
      from_entity_type: "card",
      to_entity_id: 1,
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
