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
import { API_KEY_TAG, tagWithId, tagWithList } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKeys: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: response => [
        tagWithList(API_KEY_TAG),
        ...(response?.map(({ id }) => tagWithId(API_KEY_TAG, id)) ?? []),
      ],
    }),
    countApiKeys: builder.query<number, void>({
      query: () => `/api/api-key/count`,
      providesTags: [tagWithList(API_KEY_TAG)],
    }),
    createApiKey: builder.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: body => ({
        method: "POST",
        url: `/api/api-key`,
        body,
      }),
      invalidatesTags: [tagWithList(API_KEY_TAG)],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        tagWithList(API_KEY_TAG),
        tagWithId(API_KEY_TAG, id),
      ],
    }),
    deleteApiKey: builder.mutation<void, ApiKeyId>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: (response, error, id) => [
        tagWithList(API_KEY_TAG),
        tagWithId(API_KEY_TAG, id),
      ],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKeyId>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: (response, error, id) => [
        tagWithList(API_KEY_TAG),
        tagWithId(API_KEY_TAG, id),
      ],
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
