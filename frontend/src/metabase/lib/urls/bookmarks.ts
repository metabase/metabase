import slugg from "slugg";

import type { Bookmark } from "metabase-types/api";

import { appendSlug } from "./utils";

function getBookmarkBasePath(bookmark: Bookmark) {
  if (bookmark.type === "card") {
    return bookmark.card_type;
  }
  return bookmark.type;
}

export function bookmark(bookmark: Bookmark) {
  const [, itemId] = bookmark.id.split("-");
  const basePath = getBookmarkBasePath(bookmark);
  const itemPath = appendSlug(itemId, slugg(bookmark.name));
  return `/${basePath}/${itemPath}`;
}
