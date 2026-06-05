import { publicBase } from "metabase/services";
import type { CardId, DashCardId, Dataset } from "metabase-types/api";

import { Api } from "./api";

export type PublicCardQueryRequest = {
  uuid: string;
  // `parameters` is JSON-stringified because public links apply parameters
  // client-side and pass them through the query string.
  parameters?: string;
  ignore_cache?: boolean;
};

export type PublicDashcardQueryRequest = {
  uuid: string;
  dashcardId: DashCardId;
  cardId: CardId;
  parameters?: string;
  ignore_cache?: boolean;
};

const PIVOT_PREFIX = `${publicBase}/pivot`;

export const publicApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicCardQuery: builder.query<Dataset, PublicCardQueryRequest>({
      query: ({ uuid, ...params }) => ({
        method: "GET",
        url: `${publicBase}/card/${uuid}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicCardQueryPivot: builder.query<Dataset, PublicCardQueryRequest>({
      query: ({ uuid, ...params }) => ({
        method: "GET",
        url: `${PIVOT_PREFIX}/card/${uuid}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicDashcardQuery: builder.query<Dataset, PublicDashcardQueryRequest>({
      query: ({ uuid, dashcardId, cardId, ...params }) => ({
        method: "GET",
        url: `${publicBase}/dashboard/${uuid}/dashcard/${dashcardId}/card/${cardId}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicDashcardQueryPivot: builder.query<
      Dataset,
      PublicDashcardQueryRequest
    >({
      query: ({ uuid, dashcardId, cardId, ...params }) => ({
        method: "GET",
        url: `${PIVOT_PREFIX}/dashboard/${uuid}/dashcard/${dashcardId}/card/${cardId}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useGetPublicCardQueryQuery,
  useGetPublicCardQueryPivotQuery,
  useGetPublicDashcardQueryQuery,
  useGetPublicDashcardQueryPivotQuery,
} = publicApi;
