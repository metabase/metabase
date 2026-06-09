import type {
  CancelExplorationThreadRequest,
  CancelExplorationThreadResponse,
  CreateExplorationRequest,
  Dataset,
  DocumentId,
  Exploration,
  ExplorationDocument,
  ExplorationId,
  ExplorationQueryId,
  ExplorationThreadId,
  GetExplorationDataRequest,
  GetExplorationDataResponse,
  GetMyExplorationsRequest,
  GetMyExplorationsResponse,
  UpdateExplorationRequest,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, provideMetricListTags } from "./tags";

export const explorationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getExplorationData: builder.query<
      GetExplorationDataResponse,
      GetExplorationDataRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/exploration/dimensions",
        params,
      }),
      providesTags: (response) =>
        provideMetricListTags(response?.metrics ?? []),
    }),
    getExploration: builder.query<Exploration, ExplorationId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/${id}`,
      }),
      providesTags: (exploration) =>
        exploration ? [idTag("exploration", exploration.id)] : [],
    }),
    getMyExplorations: builder.query<
      GetMyExplorationsResponse,
      GetMyExplorationsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/exploration/mine",
        params,
      }),
      providesTags: () => [listTag("exploration")],
    }),
    createExploration: builder.mutation<Exploration, CreateExplorationRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/exploration",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("exploration")]),
    }),
    updateExploration: builder.mutation<Exploration, UpdateExplorationRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/exploration/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("exploration", id),
          listTag("exploration"),
        ]),
    }),
    restartExploration: builder.mutation<Exploration, ExplorationId>({
      query: (id) => ({
        method: "POST",
        url: `/api/exploration/${id}/restart`,
      }),
      invalidatesTags: (exploration, error, id) =>
        invalidateTags(error, [
          idTag("exploration", id),
          // The thread's AI Summary doc was reset to its placeholder server-side; invalidate it
          // so an open editor refetches instead of showing the previous run's summary.
          ...(exploration?.threads ?? []).flatMap((thread) =>
            thread.ai_summary_document_id != null
              ? [idTag("document", thread.ai_summary_document_id)]
              : [],
          ),
        ]),
    }),
    deleteExploration: builder.mutation<void, ExplorationId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/exploration/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          idTag("exploration", id),
          listTag("exploration"),
        ]),
    }),
    cancelExplorationThread: builder.mutation<
      CancelExplorationThreadResponse,
      CancelExplorationThreadRequest
    >({
      query: ({ threadId }) => ({
        method: "POST",
        url: `/api/exploration/thread/${threadId}/cancel`,
      }),
      invalidatesTags: (_, error, { explorationId }) =>
        invalidateTags(error, [idTag("exploration", explorationId)]),
    }),
    getExplorationQueryResult: builder.query<Dataset, ExplorationQueryId>({
      query: (id) => ({
        method: "GET",
        url: `/api/exploration/query/${id}`,
      }),
      // Hold each query's result in the cache for 30 minutes after the last
      // subscriber unmounts so that flipping between previously-viewed queries
      // inside one session is instant (no skeleton flash on re-select).
      keepUnusedDataFor: 30 * 60,
    }),
    createExplorationDocument: builder.mutation<
      ExplorationDocument,
      {
        explorationId: ExplorationId;
        threadId: ExplorationThreadId;
      }
    >({
      query: ({ threadId }) => ({
        method: "POST",
        url: `/api/exploration/thread/${threadId}/documents`,
      }),
      invalidatesTags: (_, error, { explorationId }) =>
        invalidateTags(error, [idTag("exploration", explorationId)]),
    }),
    appendChartToDocument: builder.mutation<
      ExplorationDocument,
      {
        threadId: ExplorationThreadId;
        documentId: DocumentId;
        exploration_query_ids: ExplorationQueryId[];
        display?: VisualizationDisplay | null;
        visualization_settings?: VisualizationSettings | null;
      }
    >({
      query: ({ threadId, documentId, ...body }) => ({
        method: "POST",
        url: `/api/exploration/thread/${threadId}/documents/${documentId}/append`,
        body,
      }),
      invalidatesTags: (result, error) =>
        invalidateTags(error, [
          ...(result ? [idTag("document", result.id)] : []),
          listTag("revision"),
        ]),
    }),
  }),
});

export const {
  useGetExplorationDataQuery,
  useGetExplorationQuery,
  useGetMyExplorationsQuery,
  useCreateExplorationMutation,
  useUpdateExplorationMutation,
  useRestartExplorationMutation,
  useDeleteExplorationMutation,
  useCancelExplorationThreadMutation,
  useGetExplorationQueryResultQuery,
  useCreateExplorationDocumentMutation,
  useAppendChartToDocumentMutation,
} = explorationApi;
