import type {
  SemanticDuplicatesResponse,
  SemanticDuplicatesStatus,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { tag } from "./tags";

export const semanticDuplicatesApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSemanticDuplicates: builder.query<
      SemanticDuplicatesResponse,
      { limit: number; offset: number }
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/semantic-search/duplicates",
        params,
      }),
      providesTags: () => [tag("semantic-duplicates")],
    }),
    getSemanticDuplicatesStatus: builder.query<SemanticDuplicatesStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/semantic-search/duplicates/status",
      }),
      providesTags: () => [tag("semantic-duplicates")],
    }),
    triggerSemanticDuplicatesBackfill: builder.mutation<
      { state: "queued" },
      void
    >({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-search/duplicates/backfill",
      }),
    }),
  }),
});

export const {
  useGetSemanticDuplicatesQuery,
  useLazyGetSemanticDuplicatesQuery,
  useGetSemanticDuplicatesStatusQuery,
  useTriggerSemanticDuplicatesBackfillMutation,
} = semanticDuplicatesApi;
