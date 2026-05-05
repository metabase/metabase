import type {
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
    createExploration: builder.mutation<Exploration, CreateExplorationRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/exploration",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("exploration")]),
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
    appendChartToDocument: builder.mutation<
      ExplorationDocument,
      {
        threadId: ExplorationThreadId;
        documentId: DocumentId;
        exploration_query_id: ExplorationQueryId;
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
  useCreateExplorationMutation,
  useGetExplorationQueryResultQuery,
  useAppendChartToDocumentMutation,
} = explorationApi;
