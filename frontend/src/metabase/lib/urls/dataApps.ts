import slugg from "slugg";

import { DataApp, Dashboard } from "metabase-types/api";

import { appendSlug } from "./utils";

function dataAppInternalPath(app: DataApp) {
  return appendSlug(`/a/${app.id}`, slugg(app.collection.name));
}

export function dataAppPreview(app: DataApp) {
  return appendSlug(`/a/preview/${app.id}`, slugg(app.collection.name));
}

export function dataApp(app: DataApp) {
  return dataAppInternalPath(app);
}

export function dataAppPage(app: DataApp, page: Dashboard) {
  return `/a/${app.id}/page/${page.id}`;
}
