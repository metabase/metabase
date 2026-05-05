import { Api } from "metabase/api/api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCommentListTags,
  provideUserListTags,
} from "metabase/api/tags";
import type {
  Comment,
  CommentId,
  CreateCommentRequest,
  CreateReactionRequest,
  ListCommentsRequest,
  ListMentionsRequest,
  MentionableUser,
  UpdateCommentRequest,
} from "metabase-types/api";

export const commentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listComments: builder.query<
      { comments: Comment[] },
      ListCommentsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/comment",
        params,
      }),
      providesTags: (response) =>
        response ? provideCommentListTags(response.comments) : [],
    }),

    createComment: builder.mutation<Comment, CreateCommentRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/comment`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/comment/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    deleteComment: builder.mutation<void, CommentId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/comment/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    toggleReaction: builder.mutation<
      { reacted: boolean },
      CreateReactionRequest
    >({
      query: ({ id, emoji }) => ({
        method: "POST",
        url: `/api/comment/${id}/reaction`,
        body: { emoji },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    listMentions: builder.query<
      { data: MentionableUser[] },
      ListMentionsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/comment/mentions",
        params,
      }),
      providesTags: (response) =>
        response ? provideUserListTags(response.data) : [],
    }),
  }),
});

export const {
  useListCommentsQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useDeleteCommentMutation,
  useToggleReactionMutation,
  useListMentionsQuery,
} = commentApi;
