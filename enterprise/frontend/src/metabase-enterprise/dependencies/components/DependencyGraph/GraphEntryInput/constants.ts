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

// data apps aren't in the search index, so the entry search lists them itself
export type EntrySearchModel = SearchModel | "data-app";

export const SEARCH_MODELS: EntrySearchModel[] = [
  ...ENABLED_SEARCH_MODELS,
  "data-app",
];

export const SEARCH_MODEL_TO_GROUP_TYPE: Partial<
  Record<SearchModel, DependencyGroupType>
> = ENABLED_SEARCH_MODEL_TO_GROUP_TYPE;
