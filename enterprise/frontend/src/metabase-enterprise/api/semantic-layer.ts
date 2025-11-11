import type { Collection } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

export const semanticLayerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    createSemanticLayer: builder.mutation<Collection, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-layer/create",
      }),
      invalidatesTags: [listTag("collection")],
    }),
  }),
});

export const { useCreateSemanticLayerMutation } = semanticLayerApi;
