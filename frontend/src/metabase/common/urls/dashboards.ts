import slugg from "slugg";

import { stringifyHashOptions } from "metabase/lib/browser";
import MetabaseSettings from "metabase/lib/settings";
import type {
  DashCardId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import { appendSlug } from "./utils";

type DashboardUrlBuilderOpts = {
  addCardWithId?: number;
  editMode?: boolean;
  tabId?: DashboardTabId | undefined;
  scrollToDashcard?: DashCardId | undefined;
};

export function dashboard(
  dashboard: {
    id: DashboardId;
    name?: string;
  },
  {
    addCardWithId,
    editMode,
    tabId,
    scrollToDashcard,
  }: DashboardUrlBuilderOpts = {},
) {
  // x-ray dashboards have ids as urls
  const path =
    typeof dashboard.id === "string"
      ? `${dashboard.id}`
      : `/dashboard/${appendSlug(dashboard.id, dashboard.name ? slugg(dashboard.name) : null)}`;

  const query = tabId
    ? new URLSearchParams({ tab: `${tabId}` }).toString()
    : "";

  const hash = stringifyHashOptions({
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
    ...(scrollToDashcard ? { scrollTo: scrollToDashcard } : {}),
  });

  return `${path}${query ? "?" + query : ""}${hash ? "#" + hash : ""}`;
}

export function publicDashboard(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedDashboard(token: EntityToken) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/dashboard/${token}`;
}
