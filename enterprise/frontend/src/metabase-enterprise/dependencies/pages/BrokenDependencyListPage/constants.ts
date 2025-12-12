import type { DependencyGroupType } from "metabase-types/api";

export const PAGE_SIZE = 20;

export const AVAILABLE_GROUP_TYPES: DependencyGroupType[] = [
  "question",
  "model",
  "metric",
  "transform",
];
