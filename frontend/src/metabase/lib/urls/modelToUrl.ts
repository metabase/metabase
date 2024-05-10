import type { RecentItem } from "metabase-types/api";

import { collection } from "./collections";
import { dashboard } from "./dashboards";
import { model } from "./models";
import { question, tableRowsQuery } from "./questions";

export function modelToUrl(item: RecentItem) {
  switch (item.model) {
    case "card":
      return question({
        ...item,
        model: "card", // somehow typescript is not smart enough to infer this
      });
    case "dataset":
      return model(item);
    case "dashboard":
      return dashboard(item);
    case "table":
      if (item?.database) {
        return tableRowsQuery(item?.database?.id, item.id);
      }
      return null;
    case "collection":
      return collection(item);
    default:
      return null;
  }
}
