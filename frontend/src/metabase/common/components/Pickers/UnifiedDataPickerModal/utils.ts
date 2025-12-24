import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type { SearchModel, SearchResponse } from "metabase-types/api";

export function hasAvailableModels(
  response: SearchResponse | undefined,
  models: SearchModel[],
) {
  const availableModels = response?.available_models ?? [];
  return models.some((model) => availableModels.includes(model));
}

export function selectOnlyCards(
  onItemSelect: (item: QuestionPickerItem) => void,
) {
  return (item: QuestionPickerItem) =>
    item.model === "card" ? onItemSelect(item) : undefined;
}
