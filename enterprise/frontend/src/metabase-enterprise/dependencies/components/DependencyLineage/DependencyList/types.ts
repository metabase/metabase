import type { DependencyNode } from "metabase-types/api";

import type { FILTER_OPTIONS, SORT_COLUMNS } from "./constants";

export type FilterOption = (typeof FILTER_OPTIONS)[number];

export type SortColumn = (typeof SORT_COLUMNS)[number];

export type SortDirection = "asc" | "desc";

export type SortOptions = {
  column: SortColumn;
  direction: SortDirection;
};

export type SearchOptions = {
  searchQuery: string;
  filterOptions: FilterOption[];
  sortOptions: SortOptions;
};

export type NodeFilter = (node: DependencyNode) => boolean;

export type NodeComparator = (
  node1: DependencyNode,
  node2: DependencyNode,
) => number;
