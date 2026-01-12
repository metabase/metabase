import type {
  CardId,
  CollectionId,
  DatabaseId,
  IndexedEntity,
  TableId,
} from "metabase-types/api";

import { action } from "./actions";
import { browseDatabase } from "./browse";
import { collection } from "./collections";
import { dashboard } from "./dashboards";
import { document } from "./documents";
import { indexedEntity } from "./indexed-entities";
import { metric, model } from "./models";
import { question, tableRowsQuery } from "./questions";
import { timeline } from "./timelines";
import { transform } from "./transforms";

export type UrlableModel = {
  id: any;
  model: string;
  name: string;
  database?: {
    id: number;
  };
  database_id?: DatabaseId;
  collection_id?: CollectionId | null;
  model_id?: CardId | null;
  table_id?: TableId;
};

const NOT_FOUND_URL = "/404";

/**
 * this isn't the best-named function in the codebase, but if you want to get a url for basically
 * anything in metabase, just put it through here
 */
export function modelToUrl(item: UrlableModel): string {
  const databaseId = item.database_id ?? item.database?.id;

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
      if (databaseId != null) {
        return tableRowsQuery(databaseId, item.id);
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
    case "indexed-entity":
      return indexedEntity(item as IndexedEntity);
    case "action":
      if (item.model_id != null) {
        return action({ id: item.model_id }, item.id);
      }
      return NOT_FOUND_URL;
    case "segment":
      if (databaseId != null && item.table_id != null) {
        return tableRowsQuery(databaseId, item.table_id, undefined, item.id);
      }
      return NOT_FOUND_URL;
    default:
      return NOT_FOUND_URL;
  }
}
