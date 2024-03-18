import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";

export function getSearchItemTableOrCardId(searchResultItem) {
  // NOTE: in the entire application when we want to use saved questions as tables
  // we have to convert IDs by adding "card__" prefix to a question id
  if (
    searchResultItem.model === "card" ||
    searchResultItem.model === "dataset"
  ) {
    return getQuestionVirtualTableId(searchResultItem.id);
  }

  return searchResultItem.id;
}
