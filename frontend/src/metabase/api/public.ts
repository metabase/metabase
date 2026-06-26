import type {
  ActionExecutionResult,
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardId,
  Dataset,
  Document,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { Api } from "./api";

export type GetPublicActionRequest = {
  uuid: string;
};

export type GetPublicCardRequest = {
  uuid: string;
};

export type GetPublicDashboardRequest = {
  uuid: string;
  dashboard_load_id?: number;
};

export type GetPublicDocumentRequest = {
  uuid: string;
};

export type ExecutePublicActionRequest = {
  uuid: string;
  parameters: ParametersForActionExecution;
};

export type ExecutePublicDashcardActionRequest = {
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  modelId: CardId | null;
  parameters: ParametersForActionExecution;
};

export type PrefetchPublicDashcardValuesRequest = {
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  // Already JSON-stringified by the caller and passed through the query string.
  parameters?: string;
};

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

const PIVOT_PREFIX = "/api/public/pivot";

export const publicApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicAction: builder.query<WritebackAction, GetPublicActionRequest>({
      query: ({ uuid }) => ({
        method: "GET",
        url: `/api/public/action/${uuid}`,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicCard: builder.query<Card, GetPublicCardRequest>({
      query: ({ uuid }) => ({
        method: "GET",
        url: `/api/public/card/${uuid}`,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicDashboard: builder.query<Dashboard, GetPublicDashboardRequest>({
      query: ({ uuid, ...params }) => ({
        method: "GET",
        url: `/api/public/dashboard/${uuid}`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    getPublicDocument: builder.query<Document, GetPublicDocumentRequest>({
      query: ({ uuid }) => ({
        method: "GET",
        url: `/api/public/document/${uuid}`,
      }),
      keepUnusedDataFor: 0,
    }),
    executePublicAction: builder.mutation<
      ActionExecutionResult,
      ExecutePublicActionRequest
    >({
      query: ({ uuid, parameters }) => ({
        method: "POST",
        url: `/api/public/action/${uuid}/execute`,
        body: { parameters },
      }),
    }),
    executePublicDashcardAction: builder.mutation<
      ActionExecutionResult,
      ExecutePublicDashcardActionRequest
    >({
      query: ({ dashboardId, dashcardId, modelId, parameters }) => ({
        method: "POST",
        url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/execute`,
        body: { modelId, parameters },
      }),
    }),
    prefetchPublicDashcardValues: builder.query<
      ParametersForActionExecution,
      PrefetchPublicDashcardValuesRequest
    >({
      query: ({ dashboardId, dashcardId, ...params }) => ({
        method: "GET",
        url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/execute`,
        params,
      }),
      keepUnusedDataFor: 0,
    }),
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
  }),
});

export const {
  useGetPublicActionQuery,
  useGetPublicCardQuery,
  useGetPublicDashboardQuery,
  useGetPublicDocumentQuery,
  useExecutePublicActionMutation,
  useExecutePublicDashcardActionMutation,
  usePrefetchPublicDashcardValuesQuery,
  useGetPublicCardQueryQuery,
  useGetPublicCardQueryPivotQuery,
  useGetPublicDashcardQueryQuery,
  useGetPublicDashcardQueryPivotQuery,
  useGetPublicDocumentCardQueryQuery,
} = publicApi;
