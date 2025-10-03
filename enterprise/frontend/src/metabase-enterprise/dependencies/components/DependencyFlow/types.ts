import type { DependencyType } from "metabase-types/api";

export type NodeId = string;
export type EdgeId = string;

export type DependencyGroup = {
  type: DependencyType;
  count: number;
};
