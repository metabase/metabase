import { useState } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useToggleReactionMutation,
  useUpdateCommentMutation,
} from "metabase/api";
import { getCommentsUrl } from "metabase/comments/utils";
import { useToast } from "metabase/common/hooks";
import { setHoveredChildTargetId } from "metabase/documents/documents.slice";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Avatar, Stack, Timeline, rem } from "metabase/ui";
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
  enableHoverHighlight?: boolean;
}

export const Discussion = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  enableHoverHighlight = false,
}: DiscussionProps) => {
  const currentUser = useSelector(getCurrentUser);
  const dispatch = useDispatch();
  const [, setNewComment] = useState<DocumentContent>();
  const parentCommentId = comments[0].id;
  const [sendToast] = useToast();
  const effectiveChildTargetId = childTargetId || comments[0]?.child_target_id;

  const [createComment] = useCreateCommentMutation();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleReaction] = useToggleReactionMutation();

  const handleSubmit = async (doc: DocumentContent, html: string) => {
    const { error } = await createComment({
      child_target_id: effectiveChildTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: parentCommentId,
      html,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to send comment`,
      });
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    const { error } = await deleteComment(comment.id);

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to delete comment`,
      });
    }
  };

  const handleResolveComment = async (comment: Comment) => {
    const { error } = await updateComment({
      id: comment.id,
      is_resolved: true,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to resolve comment`,
      });
    }
  };

  const handleReopenComment = async (comment: Comment) => {
    const { error } = await updateComment({
      id: comment.id,
      is_resolved: false,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to unresolve comment`,
      });
    }
  };

  const handleEditComment = async (
    comment: Comment,
    newContent: DocumentContent,
  ) => {
    const { error } = await updateComment({
      id: comment.id,
      content: newContent,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to update comment`,
      });
    }
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

  const handleReaction = async (comment: Comment, emoji: string) => {
    const { error } = await toggleReaction({ id: comment.id, emoji });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to add reaction`,
      });
    }
  };

  const handleReactionRemove = async (comment: Comment, emoji: string) => {
    const { error } = await toggleReaction({ id: comment.id, emoji });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to remove reaction`,
      });
    }
  };

  const handleMouseEnter = () => {
    if (enableHoverHighlight && effectiveChildTargetId) {
      dispatch(setHoveredChildTargetId(String(effectiveChildTargetId)));
    }
  };

  const handleMouseLeave = () => {
    if (enableHoverHighlight) {
      dispatch(setHoveredChildTargetId(undefined));
    }
  };

  return (
    <Stack>
      <Timeline
        bulletSize={rem(24)}
        lineWidth={1}
        className={S.discussionRoot}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
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
        {!comments[0]?.is_resolved && currentUser && (
          <Timeline.Item
            className={S.commentRoot}
            bullet={<Avatar name={currentUser.common_name} />}
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
