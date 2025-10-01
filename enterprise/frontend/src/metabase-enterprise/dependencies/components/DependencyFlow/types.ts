import type { Edge, Node } from "@xyflow/react";

import type { DependencyNode } from "metabase-types/api";

export type NodeId = Node["id"];

export type EntityNode = Node<DependencyNode, "entity">;
export type GraphNode = EntityNode;

export type GraphInfo = {
  nodes: GraphNode[];
  edges: Edge[];
};
