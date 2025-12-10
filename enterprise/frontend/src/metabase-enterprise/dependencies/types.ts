import type {
  DependencyGroupType,
  DependencySortColumn as DependencyListSortColumn,
  DependencySortDirection as DependencyListSortDirection,
} from "metabase-types/api";

export type NodeId = string;

export type NodeTypeInfo = {
  label: string;
  color: string;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type PaginationOptions = {
  pageIndex: number;
  pageSize: number;
  total: number;
};

export type DependencyGraphRawParams = {
  id?: string;
  type?: string;
};

export type DependencyListSortOptions = {
  column: DependencyListSortColumn;
  direction: DependencyListSortDirection;
};

export type DependencyListFilterOptions = {
  groupTypes: DependencyGroupType[];
};

export type DependencyListRawParams = {
  query?: unknown;
  page?: unknown;
  groupTypes?: unknown;
  sortColumn?: unknown;
  sortDirection?: unknown;
};
