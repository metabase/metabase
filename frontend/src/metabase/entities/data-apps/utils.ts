import _ from "underscore";
import type { Collection, DataApp, Dashboard } from "metabase-types/api";

export function getDataAppIcon(app?: DataApp) {
  return { name: "star" };
}

export function isDataAppCollection(collection: Collection) {
  return typeof collection.app_id === "number";
}

export function getDataAppHomePageId(dataApp: DataApp, pages: Dashboard[]) {
  if (dataApp.dashboard_id) {
    return dataApp.dashboard_id;
  }
  const [firstPage] = _.sortBy(pages, "name");
  return firstPage?.id;
}
