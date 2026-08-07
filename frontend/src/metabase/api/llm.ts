import type {
  CreateLlmProviderRequest,
  ExtractSourcesRequest,
  ExtractSourcesResponse,
  LlmActiveModel,
  LlmConnectionModels,
  LlmProviderConnection,
  LlmProviderType,
  ReorderLlmProvidersRequest,
  UpdateLlmProviderRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag } from "./tags";

export const llmApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    extractSources: builder.query<
      ExtractSourcesResponse,
      ExtractSourcesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/extract-sources",
        body,
      }),
    }),
    listLlmProviderTypes: builder.query<LlmProviderType[], void>({
      query: () => ({
        method: "GET",
        url: "/api/llm/provider-types",
      }),
    }),
    listLlmProviders: builder.query<LlmProviderConnection[], void>({
      query: () => ({
        method: "GET",
        url: "/api/llm/providers",
      }),
      providesTags: () => [listTag("llm-providers")],
    }),
    listLlmModels: builder.query<LlmConnectionModels[], void>({
      query: () => ({
        method: "GET",
        url: "/api/llm/models",
      }),
      providesTags: () => [listTag("llm-models")],
    }),
    getLlmActiveModel: builder.query<LlmActiveModel, void>({
      query: () => ({
        method: "GET",
        url: "/api/llm/active-model",
      }),
      providesTags: () => [listTag("llm-active-model")],
    }),
    reorderLlmProviders: builder.mutation<
      LlmProviderConnection[],
      ReorderLlmProvidersRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/llm/provider-order",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("llm-providers"),
          listTag("llm-active-model"),
        ]),
    }),
    createLlmProvider: builder.mutation<
      LlmProviderConnection,
      CreateLlmProviderRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/llm/providers",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("llm-providers"),
          listTag("llm-models"),
          listTag("llm-active-model"),
          "session-properties",
        ]),
    }),
    updateLlmProvider: builder.mutation<
      LlmProviderConnection,
      UpdateLlmProviderRequest
    >({
      query: ({ key, ...body }) => ({
        method: "PUT",
        url: `/api/llm/providers/${encodeURIComponent(key)}`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("llm-providers"),
          listTag("llm-models"),
          listTag("llm-active-model"),
          "session-properties",
        ]),
    }),
    deleteLlmProvider: builder.mutation<void, string>({
      query: (key) => ({
        method: "DELETE",
        url: `/api/llm/providers/${encodeURIComponent(key)}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          listTag("llm-providers"),
          listTag("llm-models"),
          listTag("llm-active-model"),
          "session-properties",
        ]),
    }),
  }),
});

export const {
  useExtractSourcesQuery,
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
  useListLlmModelsQuery,
  useGetLlmActiveModelQuery,
  useReorderLlmProvidersMutation,
  useCreateLlmProviderMutation,
  useUpdateLlmProviderMutation,
  useDeleteLlmProviderMutation,
} = llmApi;
