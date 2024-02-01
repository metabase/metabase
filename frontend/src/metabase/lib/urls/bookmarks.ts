import slugg from "slugg";

import type { Bookmark } from "metabase-types/api";

import { appendSlug } from "./utils";

function getBookmarkBasePath(bookmark: Bookmark) {
  if (bookmark.model === "card") {
    return bookmark.dataset ? "model" : "question";
  }
  return bookmark.model;
}

export function bookmark(bookmark: Bookmark) {
  const itemId = bookmark.id;
  const basePath = getBookmarkBasePath(bookmark);
  const itemPath = appendSlug(itemId, slugg(bookmark.name));
  return `/${basePath}/${itemPath}`;
}
