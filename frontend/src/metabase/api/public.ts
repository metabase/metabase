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

export type PublicDocumentCardQueryRequest = {
  uuid: string;
  cardId: CardId;
};

export type UnlockPublicLinkRequest = {
  uuid: string;
  entityType: "card" | "dashboard";
  password: string;
};

const PIVOT_PREFIX = "/api/public/pivot";

export const publicApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicCardQuery: builder.query<Dataset, PublicCardQueryRequest>({
      query: ({ uuid, ...params }) => ({
        method: "GET",
        url: `/api/public/card/${uuid}/query`,
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
        url: `/api/public/dashboard/${uuid}/dashcard/${dashcardId}/card/${cardId}`,
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
    // Unlike the endpoints above this one keeps the default cache window:
    // public document cards subscribe only while near the viewport, so
    // dropping data on unsubscribe would refetch on every scroll back.
    getPublicDocumentCardQuery: builder.query<
      Dataset,
      PublicDocumentCardQueryRequest
    >({
      query: ({ uuid, cardId }) => ({
        method: "GET",
        url: `/api/public/document/${uuid}/card/${cardId}`,
      }),
    }),
    unlockPublicLink: builder.mutation<void, UnlockPublicLinkRequest>({
      query: ({ uuid, entityType, password }) => ({
        method: "POST",
        url: `/api/public/${entityType}/${uuid}/unlock`,
        body: { password },
      }),
    }),
  }),
});

export const {
  useGetPublicCardQueryQuery,
  useGetPublicCardQueryPivotQuery,
  useGetPublicDashcardQueryQuery,
  useGetPublicDashcardQueryPivotQuery,
  useGetPublicDocumentCardQueryQuery,
  useUnlockPublicLinkMutation,
} = publicApi;
