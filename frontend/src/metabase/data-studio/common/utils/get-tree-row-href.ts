import * as Urls from "metabase/urls";

import type { TreeItem } from "../types";

export const getTreeRowHref = (row: { original: TreeItem }): string | null => {
  const { data, name } = row.original;

  if (data.model === "empty-state" || data.model === "collection") {
    return null;
  }
  if (data.id == null) {
    return null;
  }

  switch (data.model) {
    case "table":
      return Urls.dataStudioTable(data.id);
    case "metric":
      return Urls.dataStudioMetric(data.id);
    case "snippet":
      return Urls.dataStudioSnippet(data.id);
    case "action":
      return Urls.dataStudioAction(data.id);
    case "dashboard":
      return Urls.dashboard({ id: data.id, name });
    default:
      return null;
  }
};
