import { skipToken } from "@reduxjs/toolkit/query";
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
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Group, useColorScheme } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type {
  DependencyGraph,
  WorkspaceDependencyGraph,
} from "metabase-types/api";

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

const PRO_OPTIONS = {
  hideAttribution: true,
};

type DependencyGraphProps = {
  graph?: DependencyGraph | WorkspaceDependencyGraph | null;
  isFetching?: boolean;
  error?: any;
  getGraphUrl: (entry?: any) => string;
  withEntryPicker?: boolean;
  withAppSwitcher?: boolean;
  entry?: any;
  nodeTypes?: typeof NODE_TYPES;
  edgeTypes?: typeof EDGE_TYPES;
  openLinksInNewTab?: boolean;
};

export function DependencyGraph({
  entry,
  graph: externalGraph,
  isFetching: isFetchingExternally = false,
  error: externalError,
  getGraphUrl,
  withEntryPicker,
  withAppSwitcher = false,
  nodeTypes = NODE_TYPES,
  edgeTypes = EDGE_TYPES,
  openLinksInNewTab = true,
}: DependencyGraphProps) {
  const shouldFetch = entry != null && !externalGraph;
  const dependencyGraph = useGetDependencyGraphQuery(
    shouldFetch ? entry : skipToken,
  );
  const isFetching = isFetchingExternally || dependencyGraph.isFetching;
  const graph = externalGraph || dependencyGraph.data;
  const error = externalError || dependencyGraph.error;

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const { sendErrorToast } = useMetadataToasts();
  const { colorScheme } = useColorScheme();

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
      sendErrorToast(t`Failed to load the dependency graph`);
    }
  }, [error, sendErrorToast]);

  const handlePanelClose = () => {
    setSelection(null);
  };

  return (
    <GraphContext.Provider
      value={{ selection, setSelection, openLinksInNewTab }}
    >
      <ReactFlow
        className={S.reactFlow}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={PRO_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        fitView
        data-testid="dependency-graph"
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls className={S.controls} showInteractive={false} />
        <GraphNodeLayout />
        <Panel className={S.leftPanel} position="top-left">
          <Group className={S.panelContent} wrap="nowrap">
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
          <Panel className={S.rightPanel} position="top-right">
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
        {withAppSwitcher && <AppSwitcher className={S.appSwitcher} />}
      </ReactFlow>
    </GraphContext.Provider>
  );
}
