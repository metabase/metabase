import type {
  CardType,
  DependencyEntityType,
  DependencyNode,
} from "metabase-types/api";

export type NodeId = string;

export type NodeType = CardType | Exclude<DependencyEntityType, "card">;

export type NodeData = {
  node: DependencyNode;
  sources: DependencyNode[];
};
