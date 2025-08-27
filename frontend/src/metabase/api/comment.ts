import type {
  Comment,
  CommentHistory,
  CommentThread,
  CommentThreadId,
  CreateCommentRequest,
  CreateCommentThreadRequest,
  GetCommentHistoryRequest,
  ListCommentsRequest,
  UpdateCommentRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCommentListTags,
  provideCommentThreadListTags,
  provideCommentThreadTags,
} from "./tags";

export const commentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listCommentThreads: builder.query<
      CommentThread[],
      ListCommentsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/comments",
        params,
      }),
      providesTags: (response) =>
        response ? provideCommentThreadListTags(response) : [],
    }),

    getCommentThread: builder.query<CommentThread, CommentThreadId>({
      query: (threadId) => ({
        method: "GET",
        url: `/api/comments/${threadId}`,
      }),
      providesTags: (thread) =>
        thread ? provideCommentThreadTags(thread) : [],
    }),

    createCommentThread: builder.mutation<
      CommentThread,
      CreateCommentThreadRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/comments",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("comment-thread")]),
    }),

    createComment: builder.mutation<CommentThread, CreateCommentRequest>({
      query: ({ thread_id, document }) => ({
        method: "POST",
        url: `/api/comments/${thread_id}`,
        body: document,
      }),
      invalidatesTags: (_, error, { thread_id }) =>
        invalidateTags(error, [
          idTag("comment-thread", thread_id),
          listTag("comment-thread"),
          listTag("comment"),
        ]),
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ thread_id, comment_id, document }) => ({
        method: "PUT",
        url: `/api/comments/${thread_id}/comment/${comment_id}`,
        body: document,
      }),
      invalidatesTags: (_, error, { comment_id, thread_id }) =>
        invalidateTags(error, [
          idTag("comment-thread", thread_id),
          idTag("comment", comment_id),
          listTag("comment-thread"),
          listTag("comment"),
        ]),
    }),

    getCommentHistory: builder.query<CommentHistory, GetCommentHistoryRequest>({
      query: ({ thread_id, comment_id }) => ({
        method: "GET",
        url: `/api/comments/${thread_id}/comment/${comment_id}/history`,
      }),
      providesTags: (response) =>
        response && response.length > 0 ? provideCommentListTags(response) : [],
    }),
  }),
});

export const {
  useListCommentThreadsQuery,
  useGetCommentThreadQuery,
  useCreateCommentThreadMutation,
  useCreateCommentMutation,
  useUpdateCommentMutation,
  useGetCommentHistoryQuery,
} = commentApi;
