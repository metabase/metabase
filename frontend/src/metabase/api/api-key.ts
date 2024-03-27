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
import { idTag, listTag } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKeys: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: response => [
        listTag("api-key"),
        ...(response?.map(({ id }) => idTag("api-key", id)) ?? []),
      ],
    }),
    countApiKeys: builder.query<number, void>({
      query: () => `/api/api-key/count`,
      providesTags: [listTag("api-key")],
    }),
    createApiKey: builder.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: body => ({
        method: "POST",
        url: `/api/api-key`,
        body,
      }),
      invalidatesTags: [listTag("api-key")],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        listTag("api-key"),
        idTag("api-key", id),
      ],
    }),
    deleteApiKey: builder.mutation<void, ApiKeyId>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: (response, error, id) => [
        listTag("api-key"),
        idTag("api-key", id),
      ],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKeyId>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: (response, error, id) => [
        listTag("api-key"),
        idTag("api-key", id),
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
