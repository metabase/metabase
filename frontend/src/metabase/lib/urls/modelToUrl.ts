import type { CollectionId } from "metabase-types/api";

import { browseDatabase } from "./browse";
import { collection } from "./collections";
import { dashboard } from "./dashboards";
import { document } from "./documents";
import { metric, model } from "./models";
import { question, tableRowsQuery } from "./questions";
import { timeline } from "./timelines";

export type UrlableModel = {
  id: number;
  model: string;
  name: string;
  database?: {
    id: number;
  };
  collection_id?: number;
};

export function modelToUrl(item: UrlableModel) {
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
      return null;
    case "collection":
      return collection(item);
    case "document":
      return document(item);
    case "timeline":
      return timeline(item);
    case "user":
      return null;
    default:
      return null;
  }
}
