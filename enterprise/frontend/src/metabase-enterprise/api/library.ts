import type { Collection } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

export const libraryApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createLibrary: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-layer/create",
      }),
      invalidatesTags: [listTag("collection")],
    }),
  }),
});

export const { useCreateLibraryMutation } = libraryApi;
