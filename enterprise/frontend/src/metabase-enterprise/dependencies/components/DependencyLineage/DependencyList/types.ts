import type { CardDependencyNode, DependencyNode } from "metabase-types/api";

export type FilterOption =
  | "verified"
  | "in-dashboard"
  | "in-official-collection"
  | "not-in-personal-collection";

export type SortColumn = "name" | "location" | "view-count";

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

export type NodeFilter = (node: CardDependencyNode) => boolean;

export type NodeComparator = (
  node1: DependencyNode,
  node2: DependencyNode,
) => number;
