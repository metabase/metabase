import {
  Background,
  Controls,
  type Edge,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useLayoutEffect } from "react";

import type { DependencyEntry, DependencyGraph } from "metabase-types/api";

import { NodeContent } from "./NodeContent";
import { NodePicker } from "./NodePicker";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { NodeType } from "./types";
import { getInitialGraph, getNodesWithPositions } from "./utils";

const GRAPH: DependencyGraph = {
  nodes: [
    {
      id: 1,
      type: "card",
      data: { name: "Account", type: "model", display: "table" },
      dependents: { question: 10 },
    },
    {
      id: 1,
      type: "table",
      data: {
        name: "account",
        db_id: 1,
        schema: "public",
        display_name: "Account",
      },
      dependents: { model: 1 },
    },
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

const NODE_TYPES = {
  node: NodeContent,
};

type DependencyFlowProps = {
  entry: DependencyEntry | undefined;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function DependencyFlow({ entry, onEntryChange }: DependencyFlowProps) {
  const { data: graph, isFetching } = { data: GRAPH, isFetching: false };
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (graph != null && entry != null) {
      const { nodes: initialNodes, edges: initialEdges } = getInitialGraph(
        graph,
        entry,
      );
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [graph, entry, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
    >
      <Background />
      <Controls />
      <NodeLayout />
      <Panel position="top-left">
        <NodePicker
          graph={graph}
          entry={entry}
          isFetching={isFetching}
          onEntryChange={onEntryChange}
        />
      </Panel>
    </ReactFlow>
  );
}

function NodeLayout() {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow<NodeType>();
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
