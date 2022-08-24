import { Collection, DataApp } from "metabase-types/api";

export function getDataAppIcon(app?: DataApp) {
  return { name: "star" };
}

export function isDataAppCollection(collection: Collection) {
  return typeof collection.app_id === "number";
}
