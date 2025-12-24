import {
  Background,
  Controls,
  type Edge,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Group } from "metabase/ui";
import type { DependencyGraph } from "metabase-types/api";

import S from "./DependencyGraph.module.css";
import { GraphContext } from "./GraphContext";
import { GraphDependencyPanel } from "./GraphDependencyPanel";
import { GraphEdge } from "./GraphEdge";
import { GraphEntryInput } from "./GraphEntryInput";
import { GraphInfoPanel } from "./GraphInfoPanel";
import { GraphNode } from "./GraphNode";
import { GraphNodeLayout } from "./GraphNodeLayout";
import { GraphSelectInput } from "./GraphSelectionInput";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { GraphSelection, NodeType } from "./types";
import { findNode, getInitialGraph } from "./utils";

const NODE_TYPES = {
  node: GraphNode,
};

const EDGE_TYPES = {
  edge: GraphEdge,
};

type DependencyGraphProps = {
  graph?: DependencyGraph | null;
  isFetching?: boolean;
  error?: any;
  getGraphUrl: (entry?: any) => string;
  withEntryPicker?: boolean;
  entry?: any;
  nodeTypes?: typeof NODE_TYPES;
  edgeTypes?: typeof EDGE_TYPES;
};

export function DependencyGraph({
  entry,
  graph,
  isFetching = false,
  error,
  getGraphUrl,
  withEntryPicker,
  nodeTypes = NODE_TYPES,
  edgeTypes = EDGE_TYPES,
}: DependencyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const { sendErrorToast } = useMetadataToasts();

  const entryNode = useMemo(() => {
    return entry != null ? findNode(nodes, entry) : null;
  }, [nodes, entry]);

  const selectedNode = useMemo(() => {
    return selection != null ? findNode(nodes, selection) : null;
  }, [nodes, selection]);

  useEffect(() => {
    if (entry == null || error != null) {
      setNodes([]);
      setEdges([]);
      setSelection(null);
    } else if (graph != null) {
      const { nodes: initialNodes, edges: initialEdges } =
        getInitialGraph(graph);
      setNodes(initialNodes);
      setEdges(initialEdges);
      setSelection(null);
    }
  }, [entry, graph, error, setNodes, setEdges]);

  useEffect(() => {
    if (error != null) {
      sendErrorToast(t`Failed to load dependencies`);
    }
  }, [error, sendErrorToast]);

  const handlePanelClose = () => {
    setSelection(null);
  };

  return (
    <GraphContext.Provider value={{ selection, setSelection }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        data-testid="dependency-graph"
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls />
        <GraphNodeLayout />
        <Panel position="top-left">
          <Group>
            {withEntryPicker && (
              <GraphEntryInput
                node={entryNode?.data ?? null}
                isGraphFetching={isFetching}
                getGraphUrl={getGraphUrl}
              />
            )}
            {nodes.length > 1 && <GraphSelectInput nodes={nodes} />}
          </Group>
        </Panel>
        {selection != null && selectedNode != null && (
          <Panel className={S.panel} position="top-right">
            {selection.groupType != null ? (
              <GraphDependencyPanel
                node={selectedNode.data}
                groupType={selection.groupType}
                getGraphUrl={getGraphUrl}
                onClose={handlePanelClose}
              />
            ) : (
              <GraphInfoPanel
                node={selectedNode.data}
                getGraphUrl={getGraphUrl}
                onClose={handlePanelClose}
              />
            )}
          </Panel>
        )}
      </ReactFlow>
    </GraphContext.Provider>
  );
}
