import slugg from "slugg";

import { isDataAppBookmark } from "metabase/entities/bookmarks";

import { Bookmark, DataApp } from "metabase-types/api";

import { dataApp } from "./dataApps";
import { appendSlug } from "./utils";

function getBookmarkBasePath(bookmark: Bookmark) {
  if (bookmark.type === "card") {
    return bookmark.dataset ? "model" : "question";
  }
  return bookmark.type;
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
