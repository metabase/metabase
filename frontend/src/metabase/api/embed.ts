import { getEmbedBase } from "metabase/services";
import type { CardId, DashCardId, Dataset } from "metabase-types/api";

import { Api } from "./api";

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
    getEmbedCardQuery: builder.query<Dataset, EmbedCardQueryRequest>({
      // `getEmbedBase()` is resolved per request so embed previews
      // (`/api/preview_embed`) hit the preview endpoints.
      query: ({ token, ...params }) => ({
        method: "GET",
        url: `${getEmbedBase()}/card/${token}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedCardQueryPivot: builder.query<Dataset, EmbedCardQueryRequest>({
      query: ({ token, ...params }) => ({
        method: "GET",
        url: `${getEmbedBase()}/pivot/card/${token}/query`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getEmbedDashcardQuery: builder.query<Dataset, EmbedDashcardQueryRequest>({
      query: ({ token, dashcardId, cardId, ...params }) => ({
        method: "GET",
        url: `${getEmbedBase()}/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}`,
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
        url: `${getEmbedBase()}/pivot/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useGetEmbedCardQueryQuery,
  useGetEmbedCardQueryPivotQuery,
  useGetEmbedDashcardQueryQuery,
  useGetEmbedDashcardQueryPivotQuery,
} = embedApi;
