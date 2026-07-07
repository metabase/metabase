import type { TreeItem } from "metabase/data-studio/common/types";
import { isEmptyStateData } from "metabase/data-studio/common/utils";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionType,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";

type HierarchyLeafData = {
  id: number;
  table_id: TableId;
  databaseId: DatabaseId;
  schemaName: SchemaName;
};

function isHierarchyLeafData(data: unknown): data is HierarchyLeafData {
  return (
    typeof data === "object" &&
    data != null &&
    "databaseId" in data &&
    "schemaName" in data &&
    "table_id" in data &&
    "id" in data
  );
}

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
  if (treeItem.model === "segment" && isHierarchyLeafData(treeItem.data)) {
    return Urls.dataStudioDataModelSegment({
      databaseId: treeItem.data.databaseId,
      schemaName: treeItem.data.schemaName,
      tableId: treeItem.data.table_id,
      segmentId: treeItem.data.id,
    });
  }
  if (treeItem.model === "measure" && isHierarchyLeafData(treeItem.data)) {
    return Urls.dataStudioDataModelMeasure({
      databaseId: treeItem.data.databaseId,
      schemaName: treeItem.data.schemaName,
      tableId: treeItem.data.table_id,
      measureId: treeItem.data.id,
    });
  }
  return null;
};
