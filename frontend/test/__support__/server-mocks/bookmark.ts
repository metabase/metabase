import fetchMock from "fetch-mock";
import type { Bookmark } from "metabase-types/api";

export function setupBookmarksEndpoints(bookmarks: Bookmark[]) {
  fetchMock.get("path:/api/bookmark", bookmarks);
}
