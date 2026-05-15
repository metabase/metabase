import type {
  Bookmark,
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
      onQueryStarted: async ({ orderings }, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          bookmarkApi.util.updateQueryData(
            "listBookmarks",
            undefined,
            (draft) => {
              const indexFor = new Map(
                orderings.map(({ type, item_id }, index) => [
                  `${type}:${item_id}`,
                  index,
                ]),
              );
              draft.sort(
                (a, b) =>
                  (indexFor.get(`${a.type}:${a.item_id}`) ?? draft.length) -
                  (indexFor.get(`${b.type}:${b.item_id}`) ?? draft.length),
              );
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const {
  useListBookmarksQuery,
  useCreateBookmarkMutation,
  useDeleteBookmarkMutation,
  useReorderBookmarksMutation,
} = bookmarkApi;
