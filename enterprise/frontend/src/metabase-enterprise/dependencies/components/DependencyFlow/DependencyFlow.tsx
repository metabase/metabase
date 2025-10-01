import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useLayoutEffect } from "react";

import { skipToken } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import type { DependencyEntityType, DependencyGraph } from "metabase-types/api";

import { EntityNode } from "./EntityNode";
import { SearchPanel } from "./SearchPanel";
import { getGraphInfo } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
};

type DependencyFlowParams = {
  id: string;
  type: DependencyEntityType;
};

type DependencyFlowProps = {
  params: DependencyFlowParams;
};

export function DependencyFlow({ params }: DependencyFlowProps) {
  const id = Urls.extractEntityId(params.id)!;
  const type = params.type;
  const { data: graph = { nodes: [], edges: [] } } = useGetDependencyGraphQuery(
    id ? { id, type } : skipToken,
  );
  const { nodes, edges } = getGraphInfo(graph, id, type);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      minZoom={0.001}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
    >
      <Background />
      <Controls />
      <Panel position="top-left">
        <SearchPanel />
      </Panel>
      <FitView graph={graph} />
    </ReactFlow>
  );
}

type FitViewProps = {
  graph: DependencyGraph;
};

function FitView({ graph }: FitViewProps) {
  const { fitView } = useReactFlow();

  useLayoutEffect(() => {
    fitView();
  }, [graph, fitView]);

  return null;
}
