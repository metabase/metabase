import type { DependencyCategory } from "metabase-types/api";

export type DependentGroup = {
  category: DependencyCategory;
  count: number;
};
