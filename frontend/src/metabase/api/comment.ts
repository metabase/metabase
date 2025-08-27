import type {
  Comment,
  CommentHistory,
  CommentId,
  CreateCommentRequest,
  ListCommentsRequest,
  UpdateCommentRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, provideCommentListTags } from "./tags";

export const commentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listComments: builder.query<Comment[], ListCommentsRequest | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/comments",
        params,
      }),
      providesTags: (response) =>
        response ? provideCommentListTags(response) : [],
    }),

    createComment: builder.mutation<Comment, CreateCommentRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/comments`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/comments/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    getCommentHistory: builder.query<CommentHistory, CommentId>({
      query: (commentId) => ({
        method: "GET",
        url: `/api/comments/${commentId}/history`,
      }),
      providesTags: (response) =>
        response && response.length > 0 ? provideCommentListTags(response) : [],
    }),
  }),
});

export const {
  useListCommentsQuery,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useGetCommentHistoryQuery,
} = commentApi;
