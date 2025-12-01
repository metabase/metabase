import type { Collection, CollectionItem } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag, tag } from "./tags";

type LibraryChild = {
  description: string;
  id: number;
  name: string;
};

export const libraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createLibrary: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/library",
      }),
      invalidatesTags: [listTag("collection")],
    }),
    getLibraryCollection: builder.query<
      CollectionItem & { effective_children: LibraryChild[] },
      void
    >({
      query: () => ({
        url: `/api/ee/library`,
        method: "GET",
      }),
      providesTags: () => [tag("library-collection")],
    }),
  }),
});

export const { useCreateLibraryMutation, useGetLibraryCollectionQuery } =
  libraryApi;
