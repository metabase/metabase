import type {
  Comment,
  CommentId,
  CreateCommentRequest,
  CreateReactionRequest,
  DeleteReactionRequest,
  ListCommentsRequest,
  UpdateCommentRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, provideCommentListTags } from "./tags";

export const commentApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listComments: builder.query<
      { comments: Comment[] },
      ListCommentsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/comment",
        params,
      }),
      providesTags: (response) =>
        response ? provideCommentListTags(response.comments) : [],
    }),

    createComment: builder.mutation<Comment, CreateCommentRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/comment`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/comment/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    deleteComment: builder.mutation<void, CommentId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/comment/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    createReaction: builder.mutation<void, CreateReactionRequest>({
      query: ({ id, emoji }) => ({
        method: "POST",
        url: `/api/ee/comment/${id}/reaction`,
        body: { emoji },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    deleteReaction: builder.mutation<void, DeleteReactionRequest>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/ee/comment/${id}/reaction`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),
  }),
});

export const {
  useListCommentsQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
  useCreateReactionMutation,
  useDeleteReactionMutation,
} = commentApi;
