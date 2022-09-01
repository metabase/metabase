import slugg from "slugg";

import { Bookmark, DataApp } from "metabase-types/api";

import { dataApp } from "./dataApps";
import { appendSlug } from "./utils";

function getBookmarkBasePath(bookmark: Bookmark) {
  if (bookmark.type === "card") {
    return bookmark.dataset ? "model" : "question";
  }
  return bookmark.type;
}

function isDataAppBookmark(bookmark: Bookmark) {
  return bookmark.type === "collection" && typeof bookmark.app_id === "number";
}

export function bookmark(bookmark: Bookmark) {
  const [, itemId] = bookmark.id.split("-");

  if (isDataAppBookmark(bookmark)) {
    return dataApp(
      { id: bookmark.app_id, collection: { name: bookmark.name } } as DataApp,
      { mode: "preview" },
    );
  }

  const basePath = getBookmarkBasePath(bookmark);
  const itemPath = appendSlug(itemId, slugg(bookmark.name));
  return `/${basePath}/${itemPath}`;
}
