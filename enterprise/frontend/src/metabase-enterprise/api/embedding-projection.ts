import type { EmbeddingProjectionResponse } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const embeddingProjectionApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEmbeddingProjection: builder.query<EmbeddingProjectionResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/semantic-search/projection",
      }),
    }),
  }),
});

export const { useGetEmbeddingProjectionQuery } = embeddingProjectionApi;
