import type { DependencyGroupType } from "metabase-types/api";

export type DependencyListViewParams = {
  query?: string;
  types?: DependencyGroupType[];
  pageIndex?: number;
};
