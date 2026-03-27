import type {
  DependencyGroupType,
  DependencySortColumn,
} from "metabase-types/api";

export const BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
];

export const BROKEN_DEPENDENTS_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "transform",
];

export const BROKEN_DEPENDENTS_SORT_COLUMNS: DependencySortColumn[] = [
  "name",
  "location",
  "view-count",
];

export const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "snippet",
];

export const PAGE_SIZE = 25;
