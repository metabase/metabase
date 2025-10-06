import type { DependencyType } from "metabase-types/api";

export type DependentGroup = {
  type: DependencyType;
  count: number;
};
