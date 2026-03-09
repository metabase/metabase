import type { DependencyGroupType } from "metabase-types/api";

export const DEPENDENTS_SEARCH_THRESHOLD = 5;
export const DEFAULT_INCLUDE_PERSONAL_COLLECTIONS = true;
export const TOOLTIP_OPEN_DELAY_MS = 700;

export const DEPENDENTS_GROUP_TYPES_WITH_DATA_SOURCES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "segment",
  "measure",
  "transform",
];
