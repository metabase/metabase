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
import { tagWithId, tagWithList } from "./tags";

export const apiKeyApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKeys: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: response => [
        tagWithList("ApiKey"),
        ...(response?.map(({ id }) => tagWithId("ApiKey", id)) ?? []),
      ],
    }),
    countApiKeys: builder.query<number, void>({
      query: () => `/api/api-key/count`,
      providesTags: [tagWithList("ApiKey")],
    }),
    createApiKey: builder.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: body => ({
        method: "POST",
        url: `/api/api-key`,
        body,
      }),
      invalidatesTags: [tagWithList("ApiKey")],
    }),
    updateApiKey: builder.mutation<UpdateApiKeyResponse, UpdateApiKeyRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: (response, error, { id }) => [
        tagWithList("ApiKey"),
        tagWithId("ApiKey", id),
      ],
    }),
    deleteApiKey: builder.mutation<void, ApiKeyId>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: (response, error, id) => [
        tagWithList("ApiKey"),
        tagWithId("ApiKey", id),
      ],
    }),
    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, ApiKeyId>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: (response, error, id) => [
        tagWithList("ApiKey"),
        tagWithId("ApiKey", id),
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
