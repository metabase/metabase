import slugg from "slugg";

import { stringifyHashOptions } from "metabase/lib/browser";
import MetabaseSettings from "metabase/lib/settings";
import type { Dashboard } from "metabase-types/api";

import { appendSlug } from "./utils";

type DashboardUrlBuilderOpts = {
  addCardWithId?: number;
  editMode?: boolean;
};

export function dashboard(
  dashboard: Pick<Dashboard, "id" | "name">,
  { addCardWithId, editMode }: DashboardUrlBuilderOpts = {},
) {
  const options = {
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
  };

  const path = appendSlug(dashboard.id, slugg(dashboard.name));
  const hash = stringifyHashOptions(options);

  // x-ray dashboards have ids as urls
  if (typeof dashboard.id === "string") {
    return hash ? `${dashboard.id}#${hash}` : dashboard.id;
  } else {
    return hash ? `/dashboard/${path}#${hash}` : `/dashboard/${path}`;
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
