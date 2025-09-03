import { useState } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { Avatar, Stack, Timeline, rem } from "metabase/ui";
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useUpdateCommentMutation,
} from "metabase-enterprise/api";
import { getCommentsUrl } from "metabase-enterprise/comments/utils";
import type {
  Comment,
  CommentEntityType,
  DocumentContent,
  EntityId,
} from "metabase-types/api";

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

  const [createComment] = useCreateCommentMutation();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();

  const handleSubmit = (doc: DocumentContent) => {
    const effectiveChildTargetId =
      childTargetId || comments[0]?.child_target_id;
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
    const effectiveChildTargetId =
      childTargetId || comments[0]?.child_target_id;
    const url = getCommentsUrl({
      childTargetId: effectiveChildTargetId,
      targetId,
      targetType,
      comment,
    });

    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    sendToast({ icon: "check", message: t`Copied link` });
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
          />
        ))}
        {!comments[0]?.is_resolved && (
          <Timeline.Item
            className={S.commentRoot}
            bullet={<Avatar name={currentUser.common_name} />}
          >
            <CommentEditor
              active={false}
              onChange={(document) => setNewComment(document)}
              onSubmit={handleSubmit}
            />
          </Timeline.Item>
        )}
      </Timeline>
    </Stack>
  );
};
