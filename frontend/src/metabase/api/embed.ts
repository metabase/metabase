import type {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  Dataset,
} from "metabase-types/api";

import { Api } from "./api";

export type GetEmbedCardRequest = {
  token: string;
};

export type GetEmbedDashboardRequest = {
  token: string;
  dashboard_load_id?: number;
};

export type EmbedCardQueryRequest = {
  token: string;
  // Embeds apply parameter values server-side; `parameters` is JSON-stringified
  // and passed through the query string.
  parameters?: string;
  ignore_cache?: boolean;
};

export type EmbedDashcardQueryRequest = {
  token: string;
  dashcardId: DashCardId;
  cardId: CardId;
  parameters?: string;
  ignore_cache?: boolean;
};

export const embedApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getEmbedCard: builder.query<Card, GetEmbedCardRequest>({
      query: ({ token }) => ({
        method: "GET",
        url: `/api/embed/card/${token}`,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedDashboard: builder.query<Dashboard, GetEmbedDashboardRequest>({
      query: ({ token, ...params }) => ({
        method: "GET",
        url: `/api/embed/dashboard/${token}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedCardQuery: builder.query<Dataset, EmbedCardQueryRequest>({
      // `/api/embed` is rewritten to `/api/preview_embed` by the request
      // middleware when running inside an embed preview.
      query: ({ token, ...params }) => ({
        method: "GET",
        url: `/api/embed/card/${token}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedCardQueryPivot: builder.query<Dataset, EmbedCardQueryRequest>({
      query: ({ token, ...params }) => ({
        method: "GET",
        url: `/api/embed/pivot/card/${token}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedDashcardQuery: builder.query<Dataset, EmbedDashcardQueryRequest>({
      query: ({ token, dashcardId, cardId, ...params }) => ({
        method: "GET",
        url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedDashcardQueryPivot: builder.query<
      Dataset,
      EmbedDashcardQueryRequest
    >({
      query: ({ token, dashcardId, cardId, ...params }) => ({
        method: "GET",
        url: `/api/embed/pivot/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useGetEmbedCardQuery,
  useGetEmbedDashboardQuery,
  useGetEmbedCardQueryQuery,
  useGetEmbedCardQueryPivotQuery,
  useGetEmbedDashcardQueryQuery,
  useGetEmbedDashcardQueryPivotQuery,
} = embedApi;
