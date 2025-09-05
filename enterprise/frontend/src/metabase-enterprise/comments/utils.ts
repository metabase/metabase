import { match } from "ts-pattern";

import type { Comment, CommentEntityType, EntityId } from "metabase-types/api";

import type { CommentThread } from "./types";

export function getCommentThreads(
  comments: Comment[] | undefined,
  childTargetId?: Comment["child_target_id"],
): CommentThread[] {
  if (!comments) {
    return [];
  }

  const threadStartingComments = comments.filter(
    (comment) => comment.parent_comment_id == null,
  );

  let sortedThreadStartingComments = threadStartingComments;

  const isAllComments = childTargetId === null;
  if (isAllComments) {
    sortedThreadStartingComments = threadStartingComments.toSorted(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const threads: CommentThread[] = [];

  sortedThreadStartingComments.forEach((parent) => {
    const childComments = comments.filter((comment) => {
      return comment.parent_comment_id === parent.id;
    });
    const isActiveThread =
      !parent.is_deleted ||
      childComments.some((comment) => !comment.is_deleted);
    if (isActiveThread) {
      threads.push({
        id: parent.id,
        comments: [parent, ...childComments],
      });
    }
  });

  return threads;
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
