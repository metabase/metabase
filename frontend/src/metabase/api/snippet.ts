import { Api } from "./api";

export const snippetApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSnippets: builder.query<unknown, unknown>({
      query: () => ({
        method: "GET",
        url: "/api/native-query-snippet",
      }),
    }),
    getSnippet: builder.query<unknown, unknown>({
      query: id => ({
        method: "GET",
        url: `/api/native-query-snippet/${id}`,
      }),
    }),
    createSnippet: builder.mutation<unknown, unknown>({
      query: body => ({
        method: "POST",
        url: "/api/native-query-snippet",
        body,
      }),
    }),
    updateSnippet: builder.mutation<unknown, unknown>({
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
