import type {
  DependencyGroupType,
  DependencySortColumn,
} from "metabase-types/api";

export const DEPENDENTS_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "transform",
  "snippet",
  "dashboard",
  "document",
];

export const DEPENDENTS_SORT_COLUMNS: DependencySortColumn[] = [
  "name",
  "location",
  "view-count",
];
