import { Api } from "metabase/api/api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideCommentListTags,
  provideUserListTags,
} from "metabase/api/tags";
import type {
  BaseUser,
  Comment,
  CommentId,
  CreateCommentRequest,
  CreateReactionRequest,
  ListCommentsRequest,
  ListMentionsRequest,
  MentionableUser,
  UpdateCommentRequest,
} from "metabase-types/api";

export type DeleteCommentRequest = { id: CommentId } & ListCommentsRequest;

export type ToggleReactionRequest = CreateReactionRequest &
  ListCommentsRequest & {
    currentUser: Pick<BaseUser, "id" | "common_name">;
  };

// Update the cached comments manually, because RTK won't refetch it while
// another query is still running
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
      async onQueryStarted(_request, { dispatch, queryFulfilled }) {
        try {
          const { data: comment } = await queryFulfilled;
          dispatch(
            commentApi.util.updateQueryData(
              "listComments",
              {
                target_type: comment.target_type,
                target_id: comment.target_id,
              },
              (draft) => {
                draft.comments.push(comment);
              },
            ),
          );
        } catch {
          // the caller reports the error; there is nothing to patch
        }
      },
    }),

    updateComment: builder.mutation<Comment, UpdateCommentRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/comment/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
      async onQueryStarted(_request, { dispatch, queryFulfilled }) {
        try {
          const { data: comment } = await queryFulfilled;
          dispatch(
            commentApi.util.updateQueryData(
              "listComments",
              {
                target_type: comment.target_type,
                target_id: comment.target_id,
              },
              (draft) => {
                const index = draft.comments.findIndex(
                  ({ id }) => id === comment.id,
                );
                if (index !== -1) {
                  draft.comments[index] = comment;
                }
              },
            ),
          );
        } catch {
          console.error("Failed to update cached comment:", _request);
        }
      },
    }),

    deleteComment: builder.mutation<void, DeleteCommentRequest>({
      query: ({ id }) => ({
        method: "DELETE",
        url: `/api/comment/${id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
      async onQueryStarted(
        { id, target_type, target_id },
        { dispatch, queryFulfilled },
      ) {
        try {
          await queryFulfilled;
          dispatch(
            commentApi.util.updateQueryData(
              "listComments",
              { target_type, target_id },
              (draft) => {
                const comment = draft.comments.find(
                  (comment) => comment.id === id,
                );
                if (comment) {
                  comment.deleted_at = new Date().toISOString();
                }
              },
            ),
          );
        } catch {
          console.error("Failed to delete cached comment:", {
            id,
            target_type,
            target_id,
          });
        }
      },
    }),

    toggleReaction: builder.mutation<
      { reacted: boolean },
      ToggleReactionRequest
    >({
      query: ({ id, emoji }) => ({
        method: "POST",
        url: `/api/comment/${id}/reaction`,
        body: { emoji },
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("comment", id), listTag("comment")]),
      async onQueryStarted(
        { id, emoji, target_type, target_id, currentUser },
        { dispatch, queryFulfilled },
      ) {
        // unlike the pessimistic patches above, reactions toggle optimistically
        // (before the response) and roll back on error
        const patch = dispatch(
          commentApi.util.updateQueryData(
            "listComments",
            { target_type, target_id },
            (draft) => {
              const comment = draft.comments.find(
                (comment) => comment.id === id,
              );
              if (!comment) {
                return;
              }

              const reaction = comment.reactions.find(
                (reaction) => reaction.emoji === emoji,
              );
              const hasReacted = reaction?.users.some(
                (user) => user.id === currentUser.id,
              );

              if (reaction && hasReacted) {
                reaction.users = reaction.users.filter(
                  (user) => user.id !== currentUser.id,
                );
                reaction.count -= 1;
                if (reaction.count <= 0) {
                  comment.reactions = comment.reactions.filter(
                    ({ emoji }) => emoji !== reaction.emoji,
                  );
                }
              } else if (reaction) {
                reaction.users.push({
                  id: currentUser.id,
                  name: currentUser.common_name,
                });
                reaction.count += 1;
              } else {
                comment.reactions.push({
                  emoji,
                  count: 1,
                  users: [
                    { id: currentUser.id, name: currentUser.common_name },
                  ],
                });
              }
            },
          ),
        );

        try {
          await queryFulfilled;
        } catch {
          patch.undo();
          console.error("Failed to toggle reaction on cached comment:", {
            id,
            emoji,
            target_type,
            target_id,
            currentUser,
          });
        }
      },
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
