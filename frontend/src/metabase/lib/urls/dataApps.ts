import slugg from "slugg";

import { DataApp } from "metabase-types/api";

import { appendSlug } from "./utils";

function dataAppInternalPath(app: DataApp) {
  return appendSlug(`/a/${app.id}`, slugg(app.collection.name));
}

export function dataApp(app: DataApp) {
  return dataAppInternalPath(app);
}
