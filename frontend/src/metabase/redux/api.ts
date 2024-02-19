import { createApi } from "@reduxjs/toolkit/query/react";

import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  EditApiKeyInput,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

import { customBaseQuery, getListTag, providesList } from "./api-utils";

const API_KEY_TAG = "ApiKey" as const;
const LIST_TAG = getListTag(API_KEY_TAG);
const COUNT_TAG = { type: API_KEY_TAG, id: "COUNT" as const };

// Define a service using a base URL and expected endpoints
export const ApiKeysApi = createApi({
  reducerPath: "apiKeys",
  tagTypes: [API_KEY_TAG],
  baseQuery: customBaseQuery,
  endpoints: builder => ({
    list: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
      providesTags: result => providesList(result, API_KEY_TAG),
    }),
    count: builder.query<number, void>({
      query: () => `/api/api-key/count`,
      // TODO: invalide on create, delete
    }),
    create: builder.mutation<CreateApiKeyResponse, CreateApiKeyInput>({
      query: input => ({
        method: "POST",
        url: `/api/api-key`,
        body: input,
      }),
      invalidatesTags: [LIST_TAG, COUNT_TAG],
    }),
    delete: builder.mutation<void, number>({
      query: id => ({
        method: "DELETE",
        url: `/api/api-key/${id}`,
      }),
      invalidatesTags: [LIST_TAG, COUNT_TAG],
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
