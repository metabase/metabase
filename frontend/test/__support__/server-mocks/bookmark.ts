import fetchMock from "fetch-mock";
import { Bookmark } from "metabase-types/api";

export function setupBookmarksEndpoints(bookmarks: Bookmark[]) {
  fetchMock.get("path:/api/bookmark", bookmarks);
}
