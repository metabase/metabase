import type { CollectionId } from "metabase-types/api";

import { browseDatabase } from "./browse";
import { collection } from "./collections";
import { dashboard } from "./dashboards";
import { document } from "./documents";
import { metric, model } from "./models";
import { question, tableRowsQuery } from "./questions";
import { timeline } from "./timelines";
import { transform } from "./transforms";

export type UrlableModel = {
  id: number;
  model: string;
  name: string;
  database?: {
    id: number;
  };
  collection_id?: CollectionId | null;
};

const NOT_FOUND_URL = "/404";

export function modelToUrl(item: UrlableModel): string {
  switch (item.model) {
    case "card":
      return question({
        ...item,
        model: "card", // somehow typescript is not smart enough to infer this
      });
    case "database":
      return browseDatabase(item);
    case "dataset":
      return model(item);
    case "metric":
      return metric(item);
    case "dashboard":
      return dashboard(item);
    case "table":
      if (item?.database?.id) {
        return tableRowsQuery(item.database.id, item.id);
      }
      return NOT_FOUND_URL;
    case "collection":
      return collection(item);
    case "document":
      return document(item);
    case "timeline":
      return timeline(item);
    case "user":
      return NOT_FOUND_URL;
    case "transform":
      return transform(item.id);
    default:
      return NOT_FOUND_URL;
  }
}
