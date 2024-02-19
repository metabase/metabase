import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  EditApiKeyInput,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

// Define a service using a base URL and expected endpoints
export const ApiKeysApi = createApi({
  reducerPath: "apiKeys",
  baseQuery: fetchBaseQuery(),
  endpoints: builder => ({
    list: builder.query<ApiKey[], void>({
      query: () => `/api/api-key`,
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
    }),
    delete: builder.mutation<void, number>({
      query: id => ({
        method: "DELETE",
        url: `/api/api-key/${id}`,
      }),
    }),
    edit: builder.mutation<void, EditApiKeyInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
    }),
    regenerate: builder.mutation<RegenerateApiKeyResponse, number>({
      query: id => ({
        method: "PUT",
        url: `/api/api-key/${id}/regenerate`,
      }),
    }),
  }),
});

// TODO: can you force a refetch on create and edit?
// TODO: make sure I'm error handling correctly, errors as values are great, but maybe not with existing patterns?
