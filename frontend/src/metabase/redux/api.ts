import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  EditApiKeyInput,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

const LIST_ID = "LIST" as const;
const API_KEY_TAG = "ApiKey" as const;
const LIST_TAG = { type: API_KEY_TAG, id: LIST_ID };

// Define a service using a base URL and expected endpoints
export const ApiKeysApi = createApi({
  reducerPath: "apiKeys",
  tagTypes: [API_KEY_TAG],
  baseQuery: fetchBaseQuery(),
  endpoints: builder => ({
    list: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: result =>
        result
          ? [...result.map(({ id }) => ({ type: API_KEY_TAG, id })), LIST_TAG]
          : [LIST_TAG],
    }),
    count: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    create: builder.mutation<CreateApiKeyResponse, CreateApiKeyInput>({
      query: input => ({
        method: "POST",
        url: `/api/api-key`,
        body: input,
      }),
      invalidatesTags: [LIST_TAG],
    }),
    delete: builder.mutation<void, number>({
      query: id => ({
        method: "DELETE",
        url: `/api/api-key/${id}`,
      }),
      invalidatesTags: [LIST_TAG],
    }),
    edit: builder.mutation<void, EditApiKeyInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: [LIST_TAG],
    }),
    regenerate: builder.mutation<RegenerateApiKeyResponse, number>({
      query: id => ({
        method: "PUT",
        url: `/api/api-key/${id}/regenerate`,
      }),
      invalidatesTags: [LIST_TAG],
    }),
  }),
});

// TODO: can you force a refetch on create and edit?
// TODO: make sure I'm error handling correctly, errors as values are great, but maybe not with existing patterns?
