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

import { skipToken } from "metabase/api";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { DataPicker } from "./DataPicker";
import S from "./DependencyLineage.module.css";
import { DependencyList } from "./DependencyList";
import { GraphContext } from "./GraphContext";
import { GraphNode } from "./GraphNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { GraphSelection, NodeType } from "./types";
import { getInitialGraph, getNodesWithPositions } from "./utils";

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
  const { data: graph, isFetching } = useGetDependencyGraphQuery(
    entry ?? skipToken,
  );
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
      setSelection(undefined);
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
          <Panel className={S.dependencyPanel} position="top-right">
            <DependencyList
              selection={selection}
              onSelectionChange={setSelection}
            />
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
