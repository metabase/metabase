import type { Edge, Node } from "@xyflow/react";

import type { DependencyCategory, DependencyNode } from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type NodeType = Node<DependencyNode>;

export type GraphData = {
  nodes: NodeType[];
  edges: Edge[];
};

export type GraphSelection = {
  node: DependencyNode;
  category: DependencyCategory;
};

export type GraphContextType = {
  selection?: GraphSelection;
  setSelection: (selection?: GraphSelection) => void;
};
