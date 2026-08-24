import slugg from "slugg";

import { exploration } from "metabase/urls/explorations";
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

  if (bm.type === "exploration") {
    return exploration(parseInt(itemId, 10));
  }

  const basePath = getBookmarkBasePath(bm);
  const itemPath = appendSlug(itemId, slugg(bm.name));
  return `/${basePath}/${itemPath}`;
}
