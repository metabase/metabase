import * as Urls from "metabase/lib/urls";
import type { CollectionItem } from "metabase-types/api";

export function getItemUrl(item: CollectionItem) {
  switch (item.model) {
    case "table":
      return Urls.dataStudioTable(item.id);
    case "dataset":
      return Urls.dataStudioModel(item.id);
    case "metric":
      return Urls.dataStudioMetric(item.id);
    default:
      throw new TypeError(`Unsupported item: ${item.model}`);
  }
}
