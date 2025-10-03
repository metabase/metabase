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

import { skipToken } from "metabase/api";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { GroupNode } from "./GroupNode";
import { ItemNode } from "./ItemNode";
import { NodePicker } from "./NodePicker";
import type { NodeType } from "./types";
import { getInitialGraph, getNodesWithPositions } from "./utils";

const NODE_TYPES = {
  item: ItemNode,
  "item-group": GroupNode,
};

type DependencyFlowProps = {
  entry: DependencyEntry | undefined;
  onEntryChange: (entry: DependencyEntry) => void;
};

export function DependencyFlow({ entry, onEntryChange }: DependencyFlowProps) {
  const { data: graph } = useGetDependencyGraphQuery(entry ? entry : skipToken);
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
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
    >
      <Background />
      <Controls />
      <NodeLayout />
      <Panel position="top-left">
        <NodePicker entry={entry} onEntryChange={onEntryChange} />
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
      const nodesWithPositions = getNodesWithPositions(nodes, edges);
      setNodes(nodesWithPositions);
      fitView({ nodes: nodesWithPositions });
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
