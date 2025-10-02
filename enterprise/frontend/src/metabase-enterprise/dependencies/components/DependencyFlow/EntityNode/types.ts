import type { CardType, DependencyEntityType } from "metabase-types/api";

export type NodeType = CardType | Exclude<DependencyEntityType, "card">;

export type NodeGroup = {
  type: NodeType;
  count: number;
};
