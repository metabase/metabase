import type { Comment } from "metabase-types/api";

import type { CommentThread } from "./types";

export function getCommentThreads(comments: Comment[]): CommentThread[] {
  const threadStartingComments = comments.filter(
    (comment) => comment.parent_comment_id == null,
  );

  return threadStartingComments.map((parent) => ({
    id: parent.id,
    comments: comments.filter((comment) => {
      return comment.parent_comment_id === parent.id;
    }),
  }));
}
