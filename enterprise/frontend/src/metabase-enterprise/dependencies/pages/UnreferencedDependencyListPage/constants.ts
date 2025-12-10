import type {
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = ["model", "metric"];

export const PAGE_SIZE = 25;

export const DEFAULT_SORT_COLUMN: DependencySortColumn = "name";

export const DEFAULT_SORT_DIRECTION: DependencySortDirection = "asc";
