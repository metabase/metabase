import type {
  BaseEntityId,
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
import { handleLoadedByEntityId } from "./utils/lifecycle";

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
    }),
    getSnippet: builder.query<
      NativeQuerySnippet,
      NativeQuerySnippetId | BaseEntityId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/native-query-snippet/${id}`,
      }),
      providesTags: (snippet) => (snippet ? provideSnippetTags(snippet) : []),
      onQueryStarted: (id, { dispatch, queryFulfilled }) =>
        handleLoadedByEntityId(id, queryFulfilled, (snippet) =>
          dispatch(
            snippetApi.util.upsertQueryData("getSnippet", snippet.id, snippet),
          ),
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
    updateSnippet: builder.mutation<NativeQuerySnippet, UpdateSnippetRequest>({
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
