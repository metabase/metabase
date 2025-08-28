import type {
  Comment,
  CommentId,
  CreateCommentRequest,
  ListCommentsRequest,
  UpdateCommentRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, provideCommentListTags } from "./tags";

export const commentApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listComments: builder.query<Comment[], ListCommentsRequest | void>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/comments",
        params,
      }),
      providesTags: (response) =>
        response ? provideCommentListTags(response) : [],
    }),

    createComment: builder.mutation<Comment, CreateCommentRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/comments`,
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("comment")]),
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/comments/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
    }),

    getCommentHistory: builder.query<Comment[], CommentId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/comments/${id}/history`,
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
