import type { DependencyGroupType, SearchModel } from "metabase-types/api";

export type EnabledSearchModel = (typeof ENABLED_SEARCH_MODELS)[number];

export const ENABLED_SEARCH_MODELS = [
  "card",
  "dataset",
  "metric",
  "table",
  "transform",
  "dashboard",
  "document",
] as const satisfies SearchModel[];

export const ENABLED_SEARCH_MODEL_TO_GROUP_TYPE: Record<
  EnabledSearchModel,
  DependencyGroupType
> = {
  card: "question",
  dataset: "model",
  metric: "metric",
  table: "table",
  transform: "transform",
  dashboard: "dashboard",
  document: "document",
};

export const SEARCH_MODELS: SearchModel[] = ENABLED_SEARCH_MODELS;

export const SEARCH_MODEL_TO_GROUP_TYPE: Partial<
  Record<SearchModel, DependencyGroupType>
> = ENABLED_SEARCH_MODEL_TO_GROUP_TYPE;
