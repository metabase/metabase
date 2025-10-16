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
import { useLayoutEffect, useMemo, useState } from "react";

import { skipToken } from "metabase/api";
import { Flex, Group } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { GraphContext } from "./GraphContext";
import { GraphDependencyPanel } from "./GraphDependencyPanel";
import { GraphEntryInput } from "./GraphEntryInput";
import { GraphNode } from "./GraphNode";
import { GraphSelectInput } from "./GraphSelectionInput";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { GraphSelection, NodeType } from "./types";
import { getInitialGraph, getNodesWithPositions, isSameNode } from "./utils";

const NODE_TYPES = {
  node: GraphNode,
};

type DependencyLineageProps = {
  entry: DependencyEntry | undefined;
  onEntryChange: (entry: DependencyEntry | undefined) => void;
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

  const entryNode = useMemo(() => {
    return entry != null
      ? nodes.find((node) => isSameNode(node.data, entry.id, entry.type))
      : undefined;
  }, [nodes, entry]);

  const selectedNode = useMemo(() => {
    return selection != null
      ? nodes.find((node) =>
          isSameNode(node.data, selection.id, selection.type),
        )
      : undefined;
  }, [nodes, selection]);

  useLayoutEffect(() => {
    if (graph != null && entry != null) {
      const { nodes: initialNodes, edges: initialEdges } =
        getInitialGraph(graph);
      setNodes(initialNodes);
      setEdges(initialEdges);
      setSelection({ id: entry.id, type: entry.type });
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
          <Group>
            <GraphEntryInput
              node={entryNode?.data}
              isFetching={isFetching}
              onEntryChange={onEntryChange}
            />
            <GraphSelectInput nodes={nodes} onSelectionChange={setSelection} />
          </Group>
        </Panel>
        {selectedNode != null && selection?.groupType != null && (
          <Flex
            component={Panel}
            position="top-right"
            direction="column"
            bottom={0}
          >
            <GraphDependencyPanel
              node={selectedNode.data}
              groupType={selection.groupType}
              onEntryChange={onEntryChange}
              onClose={() => setSelection(undefined)}
            />
          </Flex>
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
