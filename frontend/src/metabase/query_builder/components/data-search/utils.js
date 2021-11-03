const SAVED_QUESTION_ID_PREFIX = "card__";

export function convertSearchResultToTableLikeItem(searchResultItem) {
  // NOTE: in the entire application when we want to use saved questions as tables
  // we have to convert IDs by adding "card__" prefix to a question id
  if (
    searchResultItem.model === "card" ||
    searchResultItem.model === "dataset"
  ) {
    return {
      ...searchResultItem,
      id: `${SAVED_QUESTION_ID_PREFIX}${searchResultItem.id}`,
    };
  }

  return searchResultItem;
}

export function isSavedQuestion(tableId) {
  return (
    typeof tableId === "string" && tableId.startsWith(SAVED_QUESTION_ID_PREFIX)
  );
}
