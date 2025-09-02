import { match } from "ts-pattern";

import type { Comment, CommentEntityType, EntityId } from "metabase-types/api";

import type { CommentThread } from "./types";

export function getCommentThreads(
  comments: Comment[] | undefined,
): CommentThread[] {
  if (!comments) {
    return [];
  }

  const threadStartingComments = comments.filter(
    (comment) => comment.parent_comment_id == null,
  );

  return threadStartingComments.map((parent) => ({
    id: parent.id,
    comments: [
      parent,
      ...comments.filter((comment) => {
        return comment.parent_comment_id === parent.id;
      }),
    ],
  }));
}

export function getTargetChildCommentThreads(
  comments: Comment[] | undefined,
  childTargetId: Comment["child_target_id"] | undefined,
): CommentThread[] {
  if (!comments || !childTargetId) {
    return [];
  }

  const targetComments = comments.filter(
    (comment) => comment.child_target_id === childTargetId,
  );

  return getCommentThreads(targetComments);
}

export function getCommentNodeId(comment: Comment) {
  return `comment-${comment.id}`;
}

export function getCommentsUrl({
  childTargetId,
  targetId,
  targetType,
  comment,
}: {
  childTargetId: EntityId | null;
  targetId: EntityId;
  targetType: CommentEntityType;
  comment: Comment | undefined;
}) {
  return match(targetType)
    .with("document", () => {
      const childTargetUrl = `/document/${targetId}/comments/${childTargetId}`;

      if (comment) {
        return `${childTargetUrl}#${getCommentNodeId(comment)}`;
      }

      return childTargetUrl;
    })
    .exhaustive();
}
