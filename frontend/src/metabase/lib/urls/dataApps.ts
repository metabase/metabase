import slugg from "slugg";

import { DataApp } from "metabase-types/api";

import { appendSlug } from "./utils";

function dataAppInternal(app: DataApp) {
  return appendSlug(`/a/${app.id}`, slugg(app.collection.name));
}

export function dataApp(app: DataApp) {
  return dataAppInternal(app);
}
