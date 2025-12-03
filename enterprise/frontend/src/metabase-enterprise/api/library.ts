import type { Collection } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag, tag } from "./tags";

export const libraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createLibrary: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/library",
      }),
      invalidatesTags: [listTag("collection"), tag("library-collection")],
    }),
    getLibraryCollection: builder.query<Collection, void>({
      query: () => ({
        url: `/api/ee/library`,
        method: "GET",
      }),
      providesTags: () => [tag("library-collection")],
    }),
    getLibraryCollectionTree: builder.query<Collection[], void>({
      query: () => ({
        url: `/api/ee/library/tree`,
        method: "GET",
      }),
      providesTags: () => [tag("library-collection")],
    }),
  }),
});

export const {
  useCreateLibraryMutation,
  useGetLibraryCollectionQuery,
  useGetLibraryCollectionTreeQuery,
} = libraryApi;
