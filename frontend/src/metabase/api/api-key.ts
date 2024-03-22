import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyResponse,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

import { Api } from "./api";
import { getListItemTags, API_KEY_TAG, API_KEY_LIST_TAG } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKey: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: result =>
        getListItemTags(
          API_KEY_TAG,
          result?.map(({ id }) => id),
        ),
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
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    deleteApiKey: builder.mutation<void, ApiKey["id"]>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKey["id"]>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [API_KEY_LIST_TAG],
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
