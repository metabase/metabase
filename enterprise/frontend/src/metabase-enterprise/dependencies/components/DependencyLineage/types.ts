import type { Edge, Node } from "@xyflow/react";

import type { IconName } from "metabase/ui";
import type {
  DependencyGroupType,
  DependencyId,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type NodeType = Node<DependencyNode>;

export type NodeLink = {
  url: string;
  tooltip: string;
};

export type NodeLocation = {
  icon: IconName;
  parts: NodeLocationLink[];
};

export type NodeLocationLink = {
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
  selection: GraphSelection | undefined;
  setSelection: (selection: GraphSelection | undefined) => void;
};
