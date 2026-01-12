import type { DependencyGroupType, SearchModel } from "metabase-types/api";

export type EnabledSearchModel = (typeof ENABLED_SEARCH_MODELS)[number];

// defines the order of options in the UI
export const ENABLED_SEARCH_MODELS = [
  "table",
  "transform",
  "card",
  "dataset",
  "metric",
  "dashboard",
  "document",
  "segment",
] as const satisfies SearchModel[];

export const ENABLED_SEARCH_MODEL_TO_GROUP_TYPE: Record<
  EnabledSearchModel,
  DependencyGroupType
> = {
  table: "table",
  transform: "transform",
  card: "question",
  dataset: "model",
  metric: "metric",
  dashboard: "dashboard",
  document: "document",
  segment: "segment",
};

export const SEARCH_MODELS: SearchModel[] = ENABLED_SEARCH_MODELS;

export const SEARCH_MODEL_TO_GROUP_TYPE: Partial<
  Record<SearchModel, DependencyGroupType>
> = ENABLED_SEARCH_MODEL_TO_GROUP_TYPE;
