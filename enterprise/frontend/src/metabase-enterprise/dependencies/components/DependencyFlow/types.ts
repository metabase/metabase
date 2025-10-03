import type { Node } from "@xyflow/react";

import type {
  CardType,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type GroupType = CardType | Exclude<DependencyType, "card">;
export type NodeType = ItemNodeType | GroupNodeType;
export type ItemNodeType = Node<DependencyNode, "item">;
export type GroupNodeType = Node<GroupNodeData, "item-group">;

export type GroupNodeData = {
  type: GroupType;
  count: number;
};
