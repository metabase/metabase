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

import { skipToken } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Group } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import S from "./DependencyGraph.module.css";
import { GraphContext } from "./GraphContext";
import { GraphDependencyPanel } from "./GraphDependencyPanel";
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

type DependencyGraphProps = {
  entry?: DependencyEntry;
};

export function DependencyGraph({ entry }: DependencyGraphProps) {
  const {
    data: graph,
    isFetching,
    error,
  } = useGetDependencyGraphQuery(entry ?? skipToken);
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const { sendErrorToast } = useMetadataToasts();

  const entryNode = useMemo(() => {
    return entry != null ? findNode(nodes, entry.id, entry.type) : null;
  }, [nodes, entry]);

  const selectedNode = useMemo(() => {
    return selection != null
      ? findNode(nodes, selection.id, selection.type)
      : null;
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
        nodeTypes={NODE_TYPES}
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
            <GraphEntryInput
              node={entryNode?.data ?? null}
              isGraphFetching={isFetching}
            />
            {nodes.length > 1 && <GraphSelectInput nodes={nodes} />}
          </Group>
        </Panel>
        {selection != null && selection.withInfo && selectedNode != null && (
          <Panel className={S.panel} position="top-right">
            {selection.groupType != null ? (
              <GraphDependencyPanel
                node={selectedNode.data}
                groupType={selection.groupType}
                onClose={handlePanelClose}
              />
            ) : (
              <GraphInfoPanel
                node={selectedNode.data}
                onClose={handlePanelClose}
              />
            )}
          </Panel>
        )}
      </ReactFlow>
    </GraphContext.Provider>
  );
}
