import type {
  CardType,
  DependencyNode,
  DependencyType,
} from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type GroupType = CardType | Exclude<DependencyType, "card">;

export type ItemData = {
  node: DependencyNode;
  isExpanded: boolean;
};

export type GroupData = {
  type: GroupType;
  count: number;
  isExpanded: boolean;
};
