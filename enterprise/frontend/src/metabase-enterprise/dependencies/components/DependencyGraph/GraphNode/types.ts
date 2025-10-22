import type { DependencyGroupType } from "metabase-types/api";

export type DependentGroup = {
  type: DependencyGroupType;
  count: number;
};
