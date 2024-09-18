import type {
  Comment,
  CreateCommentRequest,
  ReactToCommentRequest,
  ResolveCommentRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag, provideCommentListTags } from "./tags";

export const commentApi = Api.injectEndpoints({
  endpoints: builder => ({
    listComment: builder.query<Comment[], void>({
      query: () => ({
        method: "GET",
        url: "/api/comment",
      }),
      providesTags: (comments = []) => provideCommentListTags(comments),
    }),
    createComment: builder.mutation<Comment, CreateCommentRequest>({
      query: body => ({
        method: "POST",
        url: "/api/comment",
        body,
      }),
      invalidatesTags: (_comment, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),
    reactToComment: builder.mutation<Comment, ReactToCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/comment/${id}/react`,
        body,
      }),
      invalidatesTags: (_comment, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),
    resolveComment: builder.mutation<Comment, ResolveCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/comment/${id}`,
        body,
      }),
      invalidatesTags: (_comment, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),
  }),
});

export const {
  useListCommentQuery,
  useCreateCommentMutation,
  useReactToCommentMutation,
  useResolveCommentMutation,
} = commentApi;
