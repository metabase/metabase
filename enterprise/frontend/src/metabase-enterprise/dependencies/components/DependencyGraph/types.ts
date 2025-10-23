import type { Edge, Node } from "@xyflow/react";

import type {
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type NodeType = Node<DependencyNode>;

export type NodeTypeInfo = {
  label: string;
  color: string;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type GraphData = {
  nodes: NodeType[];
  edges: Edge[];
};

export type GraphSelection = {
  id: DependencyId;
  type: DependencyType;
  groupType?: DependencyGroupType;
  withInfo?: boolean;
};

export type GraphContextType = {
  selection: GraphSelection | null;
  setSelection: (selection: GraphSelection | null) => void;
};
