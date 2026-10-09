import * as Urls from "metabase/urls";

import type { TreeItem } from "../types";

export const getTreeRowHref = (row: { original: TreeItem }): string | null => {
  const treeItem = row.original;

  if (
    treeItem.model === "empty-state" ||
    treeItem.data.model === "empty-state"
  ) {
    return null;
  }
  // Unjustified type cast. FIXME
  const entityId = treeItem.data.id as number;
  if (treeItem.model === "metric") {
    return Urls.dataStudioMetric(entityId);
  }
  if (treeItem.model === "snippet") {
    return Urls.dataStudioSnippet(entityId);
  }
  if (treeItem.model === "action") {
    return Urls.dataStudioAction(entityId);
  }
  if (treeItem.model === "table") {
    return Urls.dataStudioTable(entityId);
  }
  if (treeItem.model === "dashboard") {
    return Urls.dashboard({ id: entityId, name: treeItem.name });
  }
  return null;
};
