import type {
  DependencyGroupType,
  DependencySortColumn,
} from "metabase-types/api";

// Keep in sync with `monitor-default-params` in enterprise/backend/src/metabase_enterprise/dependencies/api.clj.
export const BROKEN_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "transform",
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

// Keep in sync with `monitor-default-params` in enterprise/backend/src/metabase_enterprise/dependencies/api.clj.
export const UNREFERENCED_GROUP_TYPES: DependencyGroupType[] = [
  "table",
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "snippet",
];
