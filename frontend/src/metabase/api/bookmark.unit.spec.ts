import type { Store } from "@reduxjs/toolkit";

import { getStore } from "__support__/entities-store";
import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { makeMainReducers } from "metabase/reducers-main";
import type { Bookmark } from "metabase-types/api";
import { createMockBookmark } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { Api } from "./api";
import { bookmarkApi, handleBookmarkCacheInvalidation } from "./bookmark";

async function setup(opts?: { bookmarks?: Bookmark[] }) {
  const bookmarks = opts?.bookmarks ?? [];

  setupBookmarksEndpoints(bookmarks);

  const { routing, ...initState } = createMockState();
  const store = getStore(makeMainReducers(), initState, [
    Api.middleware,
  ]) as unknown as Store<State>;

  // initialize the rtk query bookmark cache
  const action = bookmarkApi.endpoints.listBookmarks.initiate();
  await store.dispatch(action as any).unwrap();

  return { store, bookmarks };
}

const getCached = (store: Store<State>) => {
  return bookmarkApi.endpoints.listBookmarks.select()(store.getState());
};

describe("bookmarks > handleBookmarkCacheInvalidation", () => {
  it("should invalidate bookmark cache when entity entity is unarchived", async () => {
    const bookmarks = [
      createMockBookmark({ id: "card-1", item_id: 1, type: "card" }),
    ];
    const { store } = await setup({ bookmarks });

    expect(getCached(store).data).toEqual(bookmarks);
    expect(getCached(store).isLoading).toEqual(false);

    handleBookmarkCacheInvalidation({
      patch: { id: 2, archived: false },
      invalidateOnKeys: [],
      bookmarkType: "card",
      dispatch: store.dispatch,
      getState: store.getState,
    });

    expect(getCached(store).isLoading).toEqual(true);
  });

  it("should invalidate bookmark cache when updating a specified key for a bookmark", async () => {
    const bookmarks = [
      createMockBookmark({
        id: "card-1",
        item_id: 1,
        type: "card",
        name: "old",
      }),
    ];
    const { store } = await setup({ bookmarks });

    expect(getCached(store).data).toEqual(bookmarks);
    expect(getCached(store).isLoading).toEqual(false);

    handleBookmarkCacheInvalidation({
      patch: { id: 1, name: "new" },
      invalidateOnKeys: ["name"],
      bookmarkType: "card",
      dispatch: store.dispatch,
      getState: store.getState,
    });

    expect(getCached(store).isLoading).toEqual(true);
  });

  it("should not invalidate bookmark cache when updating an unspecificed key for a bookmark", async () => {
    const bookmarks = [
      createMockBookmark({
        id: "card-1",
        item_id: 1,
        type: "card",
      }),
    ];
    const { store } = await setup({ bookmarks });

    expect(getCached(store).data).toEqual(bookmarks);
    expect(getCached(store).isLoading).toEqual(false);

    handleBookmarkCacheInvalidation<any>({
      patch: { id: 1, some_key: "model" },
      invalidateOnKeys: ["name"],
      bookmarkType: "card",
      dispatch: store.dispatch,
      getState: store.getState,
    });

    expect(getCached(store).isLoading).toEqual(false);
  });

  it("should not invalidate bookmark cache when updating a specified key for an unbookmarked entity", async () => {
    const bookmarks = [
      createMockBookmark({
        id: "card-1",
        item_id: 1,
        type: "card",
        name: "old",
      }),
    ];
    const { store } = await setup({ bookmarks });

    expect(getCached(store).data).toEqual(bookmarks);
    expect(getCached(store).isLoading).toEqual(false);

    handleBookmarkCacheInvalidation({
      patch: { id: 2, name: "new" },
      invalidateOnKeys: ["name"],
      bookmarkType: "card",
      dispatch: store.dispatch,
      getState: store.getState,
    });

    expect(getCached(store).isLoading).toEqual(false);
  });
});
