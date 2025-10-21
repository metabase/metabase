import {
  Background,
  Controls,
  type Edge,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Group } from "metabase/ui";
import { useLazyGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import S from "./DependencyLineage.module.css";
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

type DependencyLineageProps = {
  entry: DependencyEntry | undefined;
};

export function DependencyLineage({ entry }: DependencyLineageProps) {
  const [fetchGraph, { isFetching }] = useLazyGetDependencyGraphQuery();
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<GraphSelection>();
  const { sendErrorToast } = useMetadataToasts();

  const entryNode = useMemo(() => {
    return entry != null ? findNode(nodes, entry.id, entry.type) : undefined;
  }, [nodes, entry]);

  const selectedNode = useMemo(() => {
    return selection != null
      ? findNode(nodes, selection.id, selection.type)
      : undefined;
  }, [nodes, selection]);

  const setGraph = useCallback(
    (nodes: NodeType[], edges: Edge[], selection?: GraphSelection) => {
      setNodes(nodes);
      setEdges(edges);
      setSelection(selection);
    },
    [setEdges, setNodes],
  );

  useEffect(() => {
    if (entry == null) {
      setGraph([], []);
      return;
    }

    fetchGraph(entry).then(({ data: graph }) => {
      if (graph == null) {
        setGraph([], []);
        sendErrorToast(t`Failed to load the dependency graph`);
        return;
      }

      const { nodes: initialNodes, edges: initialEdges } =
        getInitialGraph(graph);
      setGraph(initialNodes, initialEdges, entry);
    });
  }, [entry, fetchGraph, setGraph, sendErrorToast]);

  const handlePanelClose = () => {
    setSelection(undefined);
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
        data-testid="dependency-lineage"
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls />
        <GraphNodeLayout />
        <Panel position="top-left">
          <Group>
            <GraphEntryInput
              node={entryNode?.data}
              isGraphFetching={isFetching}
            />
            {nodes.length > 1 && (
              <GraphSelectInput
                nodes={nodes}
                onSelectionChange={setSelection}
              />
            )}
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
