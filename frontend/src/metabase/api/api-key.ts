import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  RegenerateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyResponse,
} from "metabase-types/api/admin";

import { Api } from "./api";
import { API_KEY_TAG } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKey: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: [API_KEY_TAG],
    }),
    countApiKey: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    createApiKey: builder.mutation<CreateApiKeyResponse, CreateApiKeyInput>({
      query: input => ({
        method: "POST",
        url: `/api/api-key`,
        body: input,
      }),
      invalidatesTags: [API_KEY_TAG],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: [API_KEY_TAG],
    }),
    deleteApiKey: builder.mutation<void, ApiKey["id"]>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: [API_KEY_TAG],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKey["id"]>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [API_KEY_TAG],
    }),
  }),
});

export const {
  useListApiKeyQuery,
  useCountApiKeyQuery,
  useCreateApiKeyMutation,
  useRegenerateApiKeyMutation,
  useUpdateApiKeyMutation,
  useDeleteApiKeyMutation,
} = apiKeyApi;
