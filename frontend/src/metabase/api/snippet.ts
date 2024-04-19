import type {
  CreateSnippetRequest,
  ListSnippetsParams,
  NativeQuerySnippet,
  NativeQuerySnippetId,
  UpdateSnippetRequest,
} from "metabase-types/api";

import { Api } from "./api";

export const snippetApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSnippets: builder.query<
      NativeQuerySnippet[],
      ListSnippetsParams | void
    >({
      query: params => ({
        method: "GET",
        url: "/api/native-query-snippet",
        params,
      }),
    }),
    getSnippet: builder.query<NativeQuerySnippet, NativeQuerySnippetId>({
      query: id => ({
        method: "GET",
        url: `/api/native-query-snippet/${id}`,
      }),
    }),
    createSnippet: builder.mutation<NativeQuerySnippet, CreateSnippetRequest>({
      query: body => ({
        method: "POST",
        url: "/api/native-query-snippet",
        body,
      }),
    }),
    updateSnippet: builder.mutation<unknown, UpdateSnippetRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/native-query-snippet/${id}`,
        body,
      }),
    }),
  }),
});

export const {
  useListSnippetsQuery,
  useGetSnippetQuery,
  useCreateSnippetMutation,
  useUpdateSnippetMutation,
} = snippetApi;
