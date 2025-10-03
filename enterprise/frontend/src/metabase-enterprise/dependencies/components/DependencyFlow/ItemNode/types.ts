import type { CardType, DependencyType } from "metabase-types/api";

export type NodeType = CardType | Exclude<DependencyType, "card">;

export type NodeGroup = {
  type: NodeType;
  count: number;
};
