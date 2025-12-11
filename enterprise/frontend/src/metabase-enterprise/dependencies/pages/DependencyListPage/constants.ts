import type {
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

export const PAGE_SIZE = 25;

export const DEFAULT_SORT_COLUMN: DependencySortColumn = "name";

export const DEFAULT_SORT_DIRECTION: DependencySortDirection = "asc";

export const BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "transform",
];

export const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
];
