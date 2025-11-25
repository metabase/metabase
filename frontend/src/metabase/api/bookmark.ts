import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@reduxjs/toolkit/query";
import _ from "underscore";

import type {
  Bookmark,
  BookmarkType,
  CreateBookmarkRequest,
  DeleteBookmarkRequest,
  ReorderBookmarksRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideBookmarkListTags,
} from "./tags";

export const bookmarkApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listBookmarks: builder.query<Bookmark[], void>({
      query: () => ({
        method: "GET",
        url: "/api/bookmark",
      }),
      providesTags: (bookmarks = []) => provideBookmarkListTags(bookmarks),
    }),
    createBookmark: builder.mutation<Bookmark, CreateBookmarkRequest>({
      query: ({ id, type }) => ({
        method: "POST",
        url: `/api/bookmark/${type}/${id}`,
      }),
      invalidatesTags: (bookmark, error, { type, id }) =>
        invalidateTags(error, [
          listTag("bookmark"),
          idTag(type, id),
          ...(bookmark ? [idTag("bookmark", bookmark.id)] : []),
        ]),
    }),
    deleteBookmark: builder.mutation<Bookmark, DeleteBookmarkRequest>({
      query: ({ id, type }) => ({
        method: "DELETE",
        url: `/api/bookmark/${type}/${id}`,
      }),
      invalidatesTags: (bookmark, error, { type, id }) =>
        invalidateTags(error, [
          listTag("bookmark"),
          idTag(type, id),
          ...(bookmark ? [idTag("bookmark", bookmark.id)] : []),
        ]),
    }),
    reorderBookmarks: builder.mutation<void, ReorderBookmarksRequest>({
      query: (body) => ({
        method: "PUT",
        url: `/api/bookmark/ordering`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("bookmark")]),
      async onQueryStarted(patch, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          bookmarkApi.util.updateQueryData(
            "listBookmarks",
            undefined,
            (draft) => {
              const orderings = patch.orderings.map((o) => o.item_id);
              const orderMap = _.object(orderings, _.range(orderings.length));
              draft.sort((a, b) => {
                const indexA = orderMap[a.item_id] ?? Infinity;
                const indexB = orderMap[b.item_id] ?? Infinity;
                return indexA - indexB;
              });
            },
          ),
        );
        queryFulfilled.catch(() => patchResult.undo());
      },
    }),
  }),
});

/**
 * Effeciently invalidate the bookmark cache for bookmarkable entity updates.
 * `patch` is a partial entity object and `invalidateOnKeys` are a subset of
 * a patch's keys that, when changed, will trigger an invalidation event.
 */
export const handleBookmarkCacheInvalidation = <
  Patch extends { id: string | number; archived?: boolean },
>({
  patch,
  invalidateOnKeys,
  bookmarkType,
  dispatch,
  getState,
}: {
  patch: Patch;
  invalidateOnKeys: Array<keyof Patch>;
  bookmarkType: BookmarkType;
  dispatch: ThunkDispatch<any, any, UnknownAction>;
  getState: () => RootState<any, any, "metabase-api">;
}) => {
  // invalidate always as we have no way of knowing if it was bookmarked once archived
  if (patch.archived === false) {
    dispatch(Api.util.invalidateTags(["bookmark"]));
    return;
  }

  const shouldInvalidateForKey = invalidateOnKeys.some((key) => key in patch);
  if (!shouldInvalidateForKey) {
    return;
  }

  const state = getState();
  const bookmarkCache = bookmarkApi.endpoints.listBookmarks.select()(state);
  const bookmarks = bookmarkCache.data ?? [];
  const isBookmarked = !!bookmarks.find(
    (b) => b.item_id === patch.id && b.type === bookmarkType,
  );
  if (isBookmarked) {
    dispatch(Api.util.invalidateTags(["bookmark"]));
  }
};

export const {
  useListBookmarksQuery,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useReorderBookmarksMutation,
} = bookmarkApi;
