import type { CollectionItem } from "metabase-types/api";

export const findLastEditedCollectionItem = (
  collectionItems: CollectionItem[],
) => {
  return collectionItems.reduce((latest, item) => {
    if (!latest) {
      return item;
    }

    const latestTimestamp = latest?.["last-edit-info"]?.timestamp;
    const itemTimestamp = item?.["last-edit-info"]?.timestamp;

    if (latestTimestamp && itemTimestamp) {
      return latestTimestamp > itemTimestamp ? latest : item;
    }

    return latest;
  });
};
