export function convertSearchResultToTableLikeItem(searchResultItem) {
  // NOTE: in the entire application when we want to use saved questions as tables
  // we have to convert IDs by adding "card__" prefix to a question id
  if (searchResultItem.model === "card") {
    return {
      ...searchResultItem,
      id: `card__${searchResultItem.id}`,
    };
  }

  return searchResultItem;
}
