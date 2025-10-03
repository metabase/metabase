import type { CardType, DependencyType } from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;
export type GroupType = CardType | Exclude<DependencyType, "card">;

export type GroupData = {
  type: GroupType;
  count: number;
};
