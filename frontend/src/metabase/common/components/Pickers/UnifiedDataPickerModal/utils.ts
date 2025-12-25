import type { SearchModel, SearchResponse } from "metabase-types/api";

export function hasAvailableModels(
  response: SearchResponse | undefined,
  models: SearchModel[],
) {
  const availableModels = response?.available_models ?? [];
  return models.some((model) => availableModels.includes(model));
}
