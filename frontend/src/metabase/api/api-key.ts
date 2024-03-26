import type {
  ApiKey,
  ApiKeyId,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  RegenerateApiKeyResponse,
  UpdateApiKeyRequest,
  UpdateApiKeyResponse,
} from "metabase-types/api/admin";

import { Api } from "./api";
import { API_KEY_TAG } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKeys: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: [API_KEY_TAG],
    }),
    countApiKeys: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    createApiKey: builder.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: body => ({
        method: "POST",
        url: `/api/api-key`,
        body,
      }),
      invalidatesTags: [API_KEY_TAG],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: [API_KEY_TAG],
    }),
    deleteApiKey: builder.mutation<void, ApiKeyId>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: [API_KEY_TAG],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKeyId>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [API_KEY_TAG],
    }),
  }),
});

export const {
  useListApiKeysQuery,
  useCountApiKeysQuery,
  useCreateApiKeyMutation,
  useRegenerateApiKeyMutation,
  useUpdateApiKeyMutation,
  useDeleteApiKeyMutation,
} = apiKeyApi;
