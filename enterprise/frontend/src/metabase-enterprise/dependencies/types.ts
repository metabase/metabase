import type {
  CardType,
  DependencySortColumn as DependencyListSortColumn,
  DependencySortDirection as DependencyListSortDirection,
  DependencyType,
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
  types: DependencyType[];
  cardTypes: CardType[];
};

export type DependencyListRawParams = {
  types?: string | string[];
  cardTypes?: string | string[];
  page?: string;
  sortColumn?: string;
  sortDirection?: string;
};
