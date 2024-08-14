import fetchMock from "fetch-mock";

import type { Bookmark } from "metabase-types/api";

export function setupBookmarksEndpoints(bookmarks: Bookmark[]) {
  fetchMock.get("path:/api/bookmark", bookmarks);
}

export function setupBookmarksEndpointsWithError({
  error,
  status = 500,
}: {
  error: string;
  status?: number;
}) {
  fetchMock.get("path:/api/bookmark", {
    body: error,
    status,
  });
}
