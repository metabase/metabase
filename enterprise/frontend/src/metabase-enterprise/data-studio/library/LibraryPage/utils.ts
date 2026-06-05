import type { TreeItem } from "metabase/data-studio/common/types";
import { isEmptyStateData } from "metabase/data-studio/common/utils";
import * as Urls from "metabase/urls";
import type { Collection, CollectionType } from "metabase-types/api";

export function getAccessibleCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  return rootCollection.children?.find(
    (collection) => collection.type === type,
  );
}

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = getAccessibleCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}

export const getTreeRowHref = (row: { original: TreeItem }): string | null => {
  const treeItem = row.original;

  if (treeItem.model === "empty-state" || isEmptyStateData(treeItem.data)) {
    return null;
  }
  const entityId = treeItem.data.id as number;
  if (treeItem.model === "metric") {
    return Urls.dataStudioMetric(entityId);
  }
  if (treeItem.model === "snippet") {
    return Urls.dataStudioSnippet(entityId);
  }
  if (treeItem.model === "table") {
    return Urls.dataStudioTable(entityId);
  }
  return null;
};
