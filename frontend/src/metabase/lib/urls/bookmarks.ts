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
  bm: Pick<Bookmark, "id" | "type" | "card_type" | "name">,
) {
  const [, itemId] = bm.id.split("-");
  const basePath = getBookmarkBasePath(bm);
  const itemPath = appendSlug(itemId, slugg(bm.name));
  return `/${basePath}/${itemPath}`;
}
