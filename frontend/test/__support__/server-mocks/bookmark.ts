import fetchMock from "fetch-mock";

import type { Bookmark, ReorderBookmarksRequest } from "metabase-types/api";
import { createMockBookmark } from "metabase-types/api/mocks";

export function setupBookmarksEndpoints(bookmarks: Bookmark[]) {
  fetchMock.get("path:/api/bookmark", bookmarks);
}

export function setupDeleteBookmarkEndpoint({
  item_id,
  type,
}: Pick<Bookmark, "item_id" | "type">) {
  fetchMock.delete(`path:/api/bookmark/${type}/${item_id}`, 204);
}

export function setupCreateBookmarkEndpoint({
  item_id,
  type,
}: Pick<Bookmark, "item_id" | "type">) {
  fetchMock.post(
    `path:/api/bookmark/${type}/${item_id}`,
    createMockBookmark({ id: `${type}-${item_id}`, type, item_id }),
  );
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

/**
 * Stateful bookmark mocks for write-then-read tests: DELETE
 * /api/bookmark/:type/:id and PUT /api/bookmark/ordering change the list that
 * GET /api/bookmark returns, so the refetch after a write reflects it.
 * The ordering route is named `bookmark-ordering` for `fetchMock.modifyRoute`.
 */
export function setupStatefulBookmarksEndpoints(initialBookmarks: Bookmark[]) {
  let bookmarks = [...initialBookmarks];

  fetchMock.get("path:/api/bookmark", () => bookmarks);

  fetchMock.delete(/\/api\/bookmark\/\w+\/\d+$/, ({ url }) => {
    const [type, itemId] = new URL(url).pathname.split("/").slice(-2);
    bookmarks = bookmarks.filter(
      (bookmark) =>
        bookmark.type !== type || bookmark.item_id !== Number(itemId),
    );
    return 204;
  });

  fetchMock.put(
    "path:/api/bookmark/ordering",
    ({ options }) => {
      // The body is the ReorderBookmarksRequest that bookmarkApi sends
      const { orderings } = JSON.parse(
        String(options.body),
      ) as ReorderBookmarksRequest;
      const indexOf = (bookmark: Bookmark) =>
        orderings.findIndex(
          ({ type, item_id }) =>
            type === bookmark.type && item_id === bookmark.item_id,
        );
      bookmarks = [...bookmarks].sort((a, b) => indexOf(a) - indexOf(b));
      return 204;
    },
    { name: "bookmark-ordering" },
  );
}
