import type { Collection } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

export const semanticLayerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createSemanticLayerCollection: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-layer/collection",
      }),
      invalidatesTags: [listTag("collection")],
    }),
  }),
});

export const { useCreateSemanticLayerCollectionMutation } = semanticLayerApi;
