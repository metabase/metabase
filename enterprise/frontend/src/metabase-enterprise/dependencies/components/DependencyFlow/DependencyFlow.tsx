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

import { EntryNodePicker } from "./EntryNodePicker";
import { NodeContent } from "./NodeContent";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { NodeType } from "./types";
import { getInitialGraph, getNodesWithPositions } from "./utils";

const GRAPH: DependencyGraph = {
  nodes: [
    {
      id: 1,
      type: "model",
      data: { name: "Account", display: "table" },
      dependents: { question: 10 },
    },
  ],
  edges: [],
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
        <EntryNodePicker
          entry={entry}
          graph={graph}
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
