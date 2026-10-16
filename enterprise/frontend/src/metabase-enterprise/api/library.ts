import type { GetLibraryCollectionResponse } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, tag } from "./tags";

export const libraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
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

export const { useGetLibraryCollectionQuery } = libraryApi;
