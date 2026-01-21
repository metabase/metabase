import type {
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

export type DependencyListQueryParams = {
  page?: string;
  query?: string;
  "group-types"?: string | string[];
  "include-personal-collections"?: string;
  "sort-column"?: DependencySortColumn;
  "sort-direction"?: DependencySortDirection;
};
