import type { Bookmark } from "metabase-types/api";

import { Api } from "./api";
import { bookmarkListTags } from "./tags";

export const bookmarkApi = Api.injectEndpoints({
  endpoints: builder => ({
    listBookmarks: builder.query<Bookmark[], void>({
      query: () => ({
        method: "GET",
        url: "/api/bookmark",
      }),
      providesTags: (bookmarks = []) => bookmarkListTags(bookmarks),
    }),
  }),
});

export const { useListBookmarksQuery } = bookmarkApi;
