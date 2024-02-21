import { getListTag, providesList } from "metabase/redux/utils";
import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyResponse,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

import { Api } from "./api";

const API_KEY_TAG = "apiKey" as const;
const API_KEY_LIST_TAG = getListTag(API_KEY_TAG);
export const API_KEY_TAG_TYPES = [API_KEY_TAG];

const extendedApi = Api.injectEndpoints({
  endpoints: builder => ({
    listApiKey: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: result => providesList(result, API_KEY_TAG),
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
} = extendedApi;
