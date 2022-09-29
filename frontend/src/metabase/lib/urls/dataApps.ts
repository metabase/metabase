import slugg from "slugg";

import type {
  DataApp,
  DataAppNavItem,
  DataAppSearchItem,
  Dashboard,
} from "metabase-types/api";

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
  app: DataApp | DataAppSearchItem,
  { mode = "internal" }: { mode?: DataAppUrlMode } = {},
) {
  const appId = "app_id" in app ? app.app_id : app.id;
  const appName = app.collection.name;

  if (mode === "preview") {
    return appendSlug(`/apps/${appId}`, slugg(appName));
  }

  return appendSlug(`/a/${appId}`, slugg(appName));
}

function isNavItem(
  object: Dashboard | DataAppNavItem,
): object is DataAppNavItem {
  return "page_id" in object;
}

export function dataAppPage(app: DataApp, object: Dashboard | DataAppNavItem) {
  const pageId = isNavItem(object) ? object.page_id : object.id;
  return `/a/${app.id}/page/${pageId}`;
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
