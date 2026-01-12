import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

export type EdgeId = string;
export type NodeType = Node<DependencyNode>;

export type GraphData = {
  nodes: NodeType[];
  edges: Edge[];
};

export type GraphSelection = {
  id: DependencyId;
  type: DependencyType;
  groupType?: DependencyGroupType;
};

export type GraphContextType = {
  selection: GraphSelection | null;
  setSelection: (selection: GraphSelection | null) => void;
};
