import type { DependencyGroupType } from "metabase-types/api";

export type DependencyListViewParams = {
  query?: string;
  groupTypes?: DependencyGroupType[];
  pageIndex?: number;
};
