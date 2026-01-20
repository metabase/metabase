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

export type FilterCallback = (
  node: DependencyNode,
  isEnabled: boolean,
) => boolean;

export type SortCallback = (
  node1: DependencyNode,
  node2: DependencyNode,
) => number;
