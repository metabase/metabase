import type { CollectionItem } from "metabase-types/api";

export const findLastEditedCollectionItem = (
  collectionItems: Pick<CollectionItem, "last-edit-info" | "based_on_upload">[],
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
