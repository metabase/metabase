import type {
  RelatedQuestionsResponse,
  RelatedQuestionsStatus,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { tag } from "./tags";

export const relatedQuestionsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRelatedQuestions: builder.query<
      RelatedQuestionsResponse,
      { limit: number; offset: number }
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/semantic-search/related-questions",
        params,
      }),
      providesTags: () => [tag("related-questions")],
    }),
    getRelatedQuestionsStatus: builder.query<RelatedQuestionsStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/semantic-search/related-questions/status",
      }),
      providesTags: () => [tag("related-questions")],
    }),
    triggerRelatedQuestionsBackfill: builder.mutation<
      { state: "queued" },
      void
    >({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-search/related-questions/backfill",
      }),
    }),
  }),
});

export const {
  useGetRelatedQuestionsQuery,
  useLazyGetRelatedQuestionsQuery,
  useGetRelatedQuestionsStatusQuery,
  useTriggerRelatedQuestionsBackfillMutation,
} = relatedQuestionsApi;
