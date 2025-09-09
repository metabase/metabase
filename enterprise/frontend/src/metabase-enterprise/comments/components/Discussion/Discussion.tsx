import { useState } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import UserAvatar from "metabase/common/components/UserAvatar";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { Stack, rem } from "metabase/ui";
import { Timeline } from "metabase/ui/components/data-display/Timeline";
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useToggleReactionMutation,
  useUpdateCommentMutation,
} from "metabase-enterprise/api";
import { getCommentsUrl } from "metabase-enterprise/comments/utils";
import type {
  Comment,
  CommentEntityType,
  EntityId,
} from "metabase-types/api/comments";
import type { DocumentContent } from "metabase-types/api/document";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionComment } from "./DiscussionComment";

export interface DiscussionProps {
  childTargetId: EntityId | null;
  comments: Comment[];
  targetId: EntityId;
  targetType: CommentEntityType;
}

export const Discussion = ({
  childTargetId,
  comments,
  targetId,
  targetType,
}: DiscussionProps) => {
  const currentUser = useSelector(getCurrentUser);
  const [, setNewComment] = useState<DocumentContent>();
  const parentCommentId = comments[0].id;
  const [sendToast] = useToast();
  const effectiveChildTargetId = childTargetId || comments[0]?.child_target_id;

  const [createComment] = useCreateCommentMutation();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleReaction] = useToggleReactionMutation();

  const handleSubmit = (doc: DocumentContent) => {
    createComment({
      child_target_id: effectiveChildTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: parentCommentId,
    });
  };

  const handleDeleteComment = (comment: Comment) => {
    deleteComment(comment.id);
  };

  const handleResolveComment = (comment: Comment) => {
    updateComment({ id: comment.id, is_resolved: true });
  };

  const handleReopenComment = (comment: Comment) => {
    updateComment({ id: comment.id, is_resolved: false });
  };

  const handleEditComment = (comment: Comment, newContent: DocumentContent) => {
    updateComment({ id: comment.id, content: newContent });
  };

  const handleCopyLink = (comment: Comment) => {
    const url = getCommentsUrl({
      childTargetId: effectiveChildTargetId,
      targetId,
      targetType,
      comment,
    });

    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    sendToast({ icon: "check", message: t`Copied link` });
  };

  const handleReaction = (comment: Comment, emoji: string) => {
    toggleReaction({ id: comment.id, emoji });
  };

  const handleReactionRemove = (comment: Comment, emoji: string) => {
    toggleReaction({ id: comment.id, emoji });
  };

  return (
    <Stack>
      <Timeline bulletSize={rem(24)} lineWidth={1} className={S.discussionRoot}>
        {comments.map((comment, index) => (
          <DiscussionComment
            key={comment.id}
            canResolve={index === 0}
            comment={comment}
            onDelete={handleDeleteComment}
            onResolve={handleResolveComment}
            onReopen={handleReopenComment}
            onEdit={handleEditComment}
            onCopyLink={handleCopyLink}
            onReaction={handleReaction}
            onReactionRemove={handleReactionRemove}
          />
        ))}
        {!comments[0]?.is_resolved && (
          <Timeline.Item
            className={S.commentRoot}
            bullet={<UserAvatar user={currentUser} />}
          >
            <CommentEditor
              active={false}
              data-testid="comment-editor"
              onChange={(document) => setNewComment(document)}
              onSubmit={handleSubmit}
            />
          </Timeline.Item>
        )}
      </Timeline>
    </Stack>
  );
};
