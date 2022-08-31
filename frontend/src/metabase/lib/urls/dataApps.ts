import slugg from "slugg";

import type { DataApp, Dashboard } from "metabase-types/api";

import { appendSlug } from "./utils";

const DATA_APP_PAGE_URL_PATTERN = /\/a\/(\d+)\/page\/(\d+)/;

type DataAppUrlMode = "preview" | "internal" | "app-url";

/**
 * Constructs different variants of data app URLs.
 *
 * Data apps can have three kinds of paths:
 *
 * * preview (e.g. /apps/1) — allows to preview data app contents inside Metabase
 * * launched app (e.g. /a/1) — launched app, i.e. it takes over Metabase navigation
 * * launched app, custom URL (defined by user) — same as above, but with a custom user-defined URL
 *
 * @param app — data app instance
 * @param config
 * @returns {string} — pathname
 */
export function dataApp(
  app: DataApp,
  { mode = "internal" }: { mode?: DataAppUrlMode } = {},
) {
  if (mode === "preview") {
    return appendSlug(`/apps/${app.id}`, slugg(app.collection.name));
  }
  return appendSlug(`/a/${app.id}`, slugg(app.collection.name));
}

export function dataAppPage(app: DataApp, page: Dashboard) {
  return `/a/${app.id}/page/${page.id}`;
}

export function isDataAppPreviewPath(pathname: string) {
  return pathname.startsWith("/apps/");
}

export function isLaunchedDataAppPath(pathname: string) {
  return pathname.startsWith("/a/");
}

export function isDataAppPath(pathname: string) {
  return isLaunchedDataAppPath(pathname) || isDataAppPreviewPath(pathname);
}

export function isDataAppPagePath(pathname: string) {
  return DATA_APP_PAGE_URL_PATTERN.test(pathname);
}
