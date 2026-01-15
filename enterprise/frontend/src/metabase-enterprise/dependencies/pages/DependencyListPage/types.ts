import type {
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

export type DependencyListQueryParams = {
  page?: string;
  query?: string;
  groupTypes?: string | string[];
  includePersonalCollections?: string;
  sortColumn?: DependencySortColumn;
  sortDirection?: DependencySortDirection;
};
