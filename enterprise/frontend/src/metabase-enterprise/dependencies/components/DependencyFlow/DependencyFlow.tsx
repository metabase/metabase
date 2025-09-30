import { Background, Controls, ReactFlow } from "@xyflow/react";

import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { CustomNode } from "./CustomNode";
import { getGraphData } from "./utils";

const NODE_TYPES = {
  custom: CustomNode,
};

export function DependencyFlow() {
  const { data: graph } = useGetDependencyGraphQuery();
  if (!graph) {
    return null;
  }

  const { nodes, edges } = getGraphData(graph);

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  );
}
