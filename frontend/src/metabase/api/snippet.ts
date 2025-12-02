import { updateMetadata } from "metabase/lib/redux/metadata";
import { SnippetSchema } from "metabase/schema";
import type {
  CreateSnippetRequest,
  ListSnippetsParams,
  NativeQuerySnippet,
  NativeQuerySnippetId,
  UpdateSnippetRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSnippetListTags,
  provideSnippetTags,
} from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const snippetApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSnippets: builder.query<
      NativeQuerySnippet[],
      ListSnippetsParams | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/native-query-snippet",
        params,
      }),
      providesTags: (snippets = []) => provideSnippetListTags(snippets),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [SnippetSchema])),
        ),
    }),
    getSnippet: builder.query<NativeQuerySnippet, NativeQuerySnippetId>({
      query: (id) => ({
        method: "GET",
        url: `/api/native-query-snippet/${id}`,
      }),
      providesTags: (snippet) => (snippet ? provideSnippetTags(snippet) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, SnippetSchema)),
        ),
    }),
    createSnippet: builder.mutation<NativeQuerySnippet, CreateSnippetRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/native-query-snippet",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("snippet")]),
    }),
    updateSnippet: builder.mutation<unknown, UpdateSnippetRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/native-query-snippet/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("snippet"), idTag("snippet", id)]),
    }),
  }),
});

export const {
  useListSnippetsQuery,
  useGetSnippetQuery,
  useCreateSnippetMutation,
  useUpdateSnippetMutation,
} = snippetApi;
