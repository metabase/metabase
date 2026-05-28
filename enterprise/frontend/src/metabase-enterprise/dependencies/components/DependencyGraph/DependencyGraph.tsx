import {
  Background,
  Controls,
  type Edge,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Group, useColorScheme } from "metabase/ui";
import type { DependencyEntry, DependencyGraph } from "metabase-types/api";

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
  graph?: DependencyGraph;
  isFetching?: boolean;
  error?: unknown;
  entry?: DependencyEntry;
  nodeTypes?: typeof NODE_TYPES;
  edgeTypes?: typeof EDGE_TYPES;
  headerRightSide?: ReactNode;
  withEntryPicker?: boolean;
  openLinksInNewTab?: boolean;
  getGraphUrl: (entry?: DependencyEntry) => string;
};

export function DependencyGraph({
  entry,
  graph,
  isFetching = false,
  error,
  getGraphUrl,
  withEntryPicker,
  headerRightSide = null,
  nodeTypes = NODE_TYPES,
  edgeTypes = EDGE_TYPES,
  openLinksInNewTab = true,
}: DependencyGraphProps) {
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

  useLayoutEffect(() => {
    if (graph == null) {
      setNodes([]);
      setEdges([]);
    } else if (graph != null) {
      const { nodes: initialNodes, edges: initialEdges } =
        getInitialGraph(graph);
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [graph, setNodes, setEdges]);

  useLayoutEffect(() => {
    if (selection != null && selectedNode == null) {
      setSelection(null);
    }
  }, [selection, selectedNode, setSelection]);

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
            {headerRightSide}
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
      </ReactFlow>
    </GraphContext.Provider>
  );
}
