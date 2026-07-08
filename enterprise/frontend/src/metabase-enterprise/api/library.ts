import type {
  Collection,
  GetLibraryCollectionResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag, tag } from "./tags";

export const libraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createLibrary: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/library",
      }),
      invalidatesTags: [listTag("collection"), tag("library-collection")],
    }),
    getLibraryCollection: builder.query<GetLibraryCollectionResponse, void>({
      query: () => ({
        url: `/api/ee/library`,
        method: "GET",
      }),
      providesTags: (collection) => [
        // TODO Alex P 12/05/2025 Fix the endpoint to return sensible data
        ...(collection != null && "name" in collection
          ? [idTag("collection", collection.id)]
          : []),
        tag("library-collection"),
      ],
    }),
  }),
});

export const { useCreateLibraryMutation, useGetLibraryCollectionQuery } =
  libraryApi;
