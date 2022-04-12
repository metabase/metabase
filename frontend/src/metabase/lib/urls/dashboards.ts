import slugg from "slugg";

import { stringifyHashOptions } from "metabase/lib/browser";
import MetabaseSettings from "metabase/lib/settings";

import { CollectionId, Dashboard } from "metabase-types/api";

import { appendSlug } from "./utils";

export const newDashboard = (collectionId: CollectionId) =>
  `collection/${collectionId}/new_dashboard`;

type DashboardUrlBuilderOpts = {
  addCardWithId?: number;
  editMode?: boolean;
};

export function dashboard(
  dashboard: Dashboard,
  { addCardWithId, editMode }: DashboardUrlBuilderOpts = {},
) {
  const options = {
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
  };

  const path = appendSlug(dashboard.id, slugg(dashboard.name));
  const hash = stringifyHashOptions(options);
  return hash ? `/dashboard/${path}#${hash}` : `/dashboard/${path}`;
}

export function publicDashboard(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function embedDashboard(token: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/embed/dashboard/${token}`;
}
