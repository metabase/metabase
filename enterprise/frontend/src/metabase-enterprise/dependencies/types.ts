import type { IconName } from "metabase/ui";
import type {
  DependencyGroupType,
  DependencySortColumn as DependencyListSortColumn,
  DependencySortDirection as DependencyListSortDirection,
} from "metabase-types/api";

export type NodeId = string;

export type DependencyGroupTypeInfo = {
  label: string;
  color: string;
};

export type NodeLink = {
  label: string;
  url: string;
};

export type NodeLocationInfo = {
  icon: IconName;
  links: NodeLink[];
};

export type PaginationOptions = {
  pageIndex: number;
  pageSize: number;
  total: number;
};

export type DependencyListSortOptions = {
  column: DependencyListSortColumn;
  direction: DependencyListSortDirection;
};

export type DependencyListFilterOptions = {
  groupTypes: DependencyGroupType[];
};

export type DependencyErrorInfo = {
  label: string;
  detail?: string;
};
