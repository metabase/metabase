import type { DependencyGroupType, SearchModel } from "metabase-types/api";

export const SEARCH_MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "table",
  "transform",
];

// make sure that new dependency types are explicitly mapped to a search model
const GROUP_TYPE_TO_SEARCH_MODEL: Record<
  DependencyGroupType,
  SearchModel | undefined
> = {
  question: "card",
  model: "dataset",
  metric: "metric",
  table: "table",
  transform: "transform",
  snippet: undefined,
};

export const SEARCH_MODEL_TO_GROUP_TYPE: Partial<
  Record<SearchModel, DependencyGroupType>
> = Object.fromEntries(
  Object.entries(GROUP_TYPE_TO_SEARCH_MODEL).map(([groupType, model]) => [
    model,
    groupType,
  ]),
);
