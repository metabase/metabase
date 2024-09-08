import slugg from "slugg";

import { stringifyHashOptions } from "metabase/lib/browser";
import MetabaseSettings from "metabase/lib/settings";
import type { Dashboard, DashboardTabId } from "metabase-types/api";

import { appendSlug } from "./utils";

type DashboardUrlBuilderOpts = {
  addCardWithId?: number;
  editMode?: boolean;
  tabId?: DashboardTabId | undefined;
};

export function dashboard(
  dashboard: Pick<Dashboard, "id" | "name">,
  { addCardWithId, editMode, tabId }: DashboardUrlBuilderOpts = {},
) {
  const options = {
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
  };

  const path = appendSlug(dashboard.id, slugg(dashboard.name));

  let query = tabId ? new URLSearchParams({ tab: `${tabId}` }).toString() : "";
  if (query) {
    query = `?${query}`;
  }

  let hash = stringifyHashOptions(options);
  if (hash) {
    hash = `#${hash}`;
  }

  // x-ray dashboards have ids as urls
  if (typeof dashboard.id === "string") {
    return `${dashboard.id}${query}${hash}`;
  } else {
    return `/dashboard/${path}${query}${hash}`;
  }
}

export function publicDashboard(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedDashboard(token: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/dashboard/${token}`;
}
