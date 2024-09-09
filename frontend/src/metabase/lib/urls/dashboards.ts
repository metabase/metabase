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
  // x-ray dashboards have ids as urls
  const path =
    typeof dashboard.id === "string"
      ? `${dashboard.id}`
      : `/dashboard/${appendSlug(dashboard.id, slugg(dashboard.name))}`;

  const query = tabId
    ? new URLSearchParams({ tab: `${tabId}` }).toString()
    : "";

  const hash = stringifyHashOptions({
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
  });

  return `${path}${query ? "?" + query : ""}${hash ? "#" + hash : ""}`;
}

export function publicDashboard(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedDashboard(token: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/dashboard/${token}`;
}
