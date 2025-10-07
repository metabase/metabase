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
import { useEffect, useLayoutEffect, useState } from "react";

import type { DependencyEntry, DependencyGraph } from "metabase-types/api";

import { DataPicker } from "./DataPicker";
import { DependencyList } from "./DependencyList";
import { GraphContext } from "./GraphContext";
import { GraphNode } from "./GraphNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { GraphSelection, NodeType } from "./types";
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
  node: GraphNode,
};

type DependencyLineageProps = {
  entry: DependencyEntry | undefined;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function DependencyLineage({
  entry,
  onEntryChange,
}: DependencyLineageProps) {
  const { data: graph, isFetching } = { data: GRAPH, isFetching: false };
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<GraphSelection>();

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
    <GraphContext.Provider value={{ selection, setSelection }}>
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
        <GraphNodeLayout />
        <Panel position="top-left">
          <DataPicker
            graph={graph}
            entry={entry}
            isFetching={isFetching}
            onEntryChange={onEntryChange}
          />
        </Panel>
        {selection && (
          <Panel position="top-right">
            <DependencyList selection={selection} />
          </Panel>
        )}
      </ReactFlow>
    </GraphContext.Provider>
  );
}

function GraphNodeLayout() {
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
