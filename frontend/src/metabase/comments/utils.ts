import dayjs from "dayjs";
import { replace } from "react-router-redux";
import type { LocationSensorState } from "react-use/lib/useLocation";
import { match } from "ts-pattern";

import type { DispatchFn } from "metabase/lib/redux";
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
      !parent.deleted_at ||
      childComments.some((comment) => !comment.deleted_at);
    if (isActiveThread) {
      threads.push({
        id: parent.id,
        comments: [parent, ...childComments],
      });
    }
  });

  return threads;
}

export function getCommentsCount(comments: Comment[]): number {
  return getCommentThreads(comments)
    .flatMap((thread) => thread.comments)
    .filter((comment) => !comment.deleted_at).length;
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

export function formatCommentDate(dateOrString: string | Date) {
  const date =
    dateOrString instanceof Date ? dateOrString : new Date(dateOrString);
  const now = new Date();

  const oneDay = 24 * 60 * 60 * 1000;
  const is24hAgo = now.getTime() - date.getTime() < oneDay;

  if (is24hAgo) {
    return dayjs(date).fromNow();
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export function deleteNewParamFromURLIfNeeded(
  location: LocationSensorState,
  dispatch: DispatchFn,
) {
  const search = new URLSearchParams(location.search);

  if (search.get("new") == null) {
    return;
  }

  search.delete("new");
  const newSearch = search.toString();
  dispatch(replace({ pathname: location.pathname, search: newSearch }));
}
