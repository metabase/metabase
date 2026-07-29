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
import { hydrateMetadataStore } from "./utils/hydrate-metadata-store";

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
      onQueryStarted: hydrateMetadataStore([SnippetSchema]),
    }),
    getSnippet: builder.query<NativeQuerySnippet, NativeQuerySnippetId>({
      query: (id) => ({
        method: "GET",
        url: `/api/native-query-snippet/${id}`,
      }),
      providesTags: (snippet) => (snippet ? provideSnippetTags(snippet) : []),
      onQueryStarted: hydrateMetadataStore(SnippetSchema),
    }),
    createSnippet: builder.mutation<NativeQuerySnippet, CreateSnippetRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/native-query-snippet",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("snippet")]),
      onQueryStarted: hydrateMetadataStore(SnippetSchema),
    }),
    updateSnippet: builder.mutation<NativeQuerySnippet, UpdateSnippetRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/native-query-snippet/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("snippet"), idTag("snippet", id)]),
      onQueryStarted: hydrateMetadataStore(SnippetSchema),
    }),
  }),
});

export const {
  useListSnippetsQuery,
  useGetSnippetQuery,
  useCreateSnippetMutation,
  useUpdateSnippetMutation,
} = snippetApi;
