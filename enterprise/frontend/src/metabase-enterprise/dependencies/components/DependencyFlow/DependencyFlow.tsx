import { Background, Controls, ReactFlow } from "@xyflow/react";

import type { DependencyGraph } from "metabase-types/api";

import { getGraphData } from "./utils";

const GRAPH: DependencyGraph = {
  nodes: [
    {
      id: 1,
      type: "table",
      entity: {
        id: 1,
        name: "PRODUCTS",
        display_name: "Products",
      },
    },
    {
      id: 1,
      type: "card",
      entity: {
        id: 1,
        name: "Count of Products",
      },
    },
  ],
  edges: [
    {
      from_entity_id: 1,
      from_entity_type: "table",
      to_entity_id: 1,
      to_entity_type: "card",
    },
  ],
};

export function DependencyFlow() {
  const { nodes, edges } = getGraphData(GRAPH);

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  );
}
