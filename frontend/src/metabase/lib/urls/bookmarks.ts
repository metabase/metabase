import slugg from "slugg";

import type { Bookmark } from "metabase-types/api";

import { appendSlug } from "./utils";

function getBookmarkBasePath(bookmark: Pick<Bookmark, "type" | "card_type">) {
  if (bookmark.type === "card") {
    return bookmark.card_type;
  }
  return bookmark.type;
}

export function bookmark(
  bm: Pick<Bookmark, "id" | "type" | "card_type" | "name" | "dashboard_id">,
) {
  // HACK: to make bookmarks for dashboard questions to take you to their dashboard pages
  // TODO: need to take the user to the place on the dashboard where the question actually is...
  if (bm.type === "card" && typeof bm.dashboard_id === "number") {
    return bookmark({
      id: `dashboard-${bm.dashboard_id}`,
      type: "dashboard",
      name: "",
    });
  }

  const [, itemId] = bm.id.split("-");
  const basePath = getBookmarkBasePath(bm);
  const itemPath = appendSlug(itemId, slugg(bm.name));
  return `/${basePath}/${itemPath}`;
}
