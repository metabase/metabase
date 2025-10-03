import type { Edge, Node } from "@xyflow/react";

import type { DependencyNode, DependencyType } from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;

export type DependencyGroup = {
  type: DependencyType;
  count: number;
};

export type ItemNodeType = Node<DependencyNode>;
export type GroupNodeType = Node<DependencyGroup>;
export type GraphNode = ItemNodeType | GroupNodeType;

export type Graph = {
  nodes: GraphNode[];
  edges: Edge[];
};
