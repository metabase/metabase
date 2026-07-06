import cx from "classnames";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useToggleReactionMutation,
  useUpdateCommentMutation,
} from "metabase/api";
import { useCommentUrl } from "metabase/comments/hooks/use-comment-url";
import type {
  CommentExtraRenderer,
  CommentsLayout,
} from "metabase/comments/types";
import { getCommentNodeId } from "metabase/comments/utils";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Avatar, Box, Button, Stack, Timeline, rem } from "metabase/ui";
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
  onHoverChange?: (childTargetId: string | undefined) => void;
  renderExtra?: CommentExtraRenderer;
  layout?: CommentsLayout;
}

export const Discussion = ({
  childTargetId,
  comments,
  targetId,
  targetType,
  onHoverChange,
  renderExtra,
  layout = "sidesheet",
}: DiscussionProps) => {
  const currentUser = useSelector(getUser);
  const [, setNewComment] = useState<DocumentContent>();
  // In the sidebar layout replies stay collapsed until the reader expands the
  // thread (via the "N replies" toggle or the hover "Reply" action).
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoFocusReply, setAutoFocusReply] = useState(false);
  const parentCommentId = comments[0].id;
  const [sendToast] = useToast();
  const effectiveChildTargetId = childTargetId || comments[0]?.child_target_id;

  const [createComment] = useCreateCommentMutation();
  const [updateComment] = useUpdateCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [toggleReaction] = useToggleReactionMutation();

  const commentsUrl = useCommentUrl({ childTargetId: effectiveChildTargetId });

  const handleSubmit = async (doc: DocumentContent) => {
    const { error } = await createComment({
      child_target_id: effectiveChildTargetId,
      target_id: targetId,
      target_type: targetType,
      content: doc,
      parent_comment_id: parentCommentId,
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
    const { error } = await deleteComment({
      id: comment.id,
      target_type: comment.target_type,
      target_id: comment.target_id,
    });

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
    const url = comment
      ? `${commentsUrl}#${getCommentNodeId(comment)}`
      : commentsUrl;

    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    sendToast({ icon: "check", message: t`Copied link` });
  };

  const handleToggleReaction = async (
    comment: Comment,
    emoji: string,
    errorMessage: string,
  ) => {
    if (!currentUser) {
      return;
    }

    const { error } = await toggleReaction({
      id: comment.id,
      emoji,
      target_type: comment.target_type,
      target_id: comment.target_id,
      currentUser,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: errorMessage,
      });
    }
  };

  const handleReaction = (comment: Comment, emoji: string) =>
    handleToggleReaction(comment, emoji, t`Failed to add reaction`);

  const handleReactionRemove = (comment: Comment, emoji: string) =>
    handleToggleReaction(comment, emoji, t`Failed to remove reaction`);

  const handleMouseEnter = () => {
    if (effectiveChildTargetId) {
      onHoverChange?.(String(effectiveChildTargetId));
    }
  };

  const handleMouseLeave = () => {
    onHoverChange?.(undefined);
  };

  const handleReply = () => {
    setIsExpanded(true);
    setAutoFocusReply(true);
  };

  const isSidebar = layout === "sidebar";
  const avatarSize = isSidebar ? rem(32) : rem(24);
  // In the sidebar, the context meta (timeline / segment pills) sits above the
  // whole comment rather than inline next to the avatar.
  const rootExtra = isSidebar ? renderExtra?.(comments[0]) : null;
  const replyCount = comments.length - 1;
  const hasHiddenReplies = isSidebar && !isExpanded && replyCount > 0;
  // In the sidebar, collapse replies behind a toggle until the reader opens the
  // thread; the sidesheet layout always shows the full thread.
  const visibleComments =
    hasHiddenReplies && comments.length > 0 ? [comments[0]] : comments;
  const showReplyEditor =
    !comments[0]?.is_resolved && (!isSidebar || isExpanded);

  return (
    <Stack gap={0}>
      {rootExtra && <Box mb="sm">{rootExtra}</Box>}
      <Timeline
        bulletSize={avatarSize}
        lineWidth={1}
        className={cx(S.discussionRoot, {
          [S.discussionRootSidebar]: isSidebar,
        })}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {visibleComments.map((comment, index) => (
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
            onReply={isSidebar && index === 0 ? handleReply : undefined}
            renderExtra={isSidebar ? undefined : renderExtra}
            layout={layout}
          />
        ))}
        {showReplyEditor && currentUser && (
          <Timeline.Item
            className={S.commentRoot}
            bullet={<Avatar name={currentUser.common_name} size={avatarSize} />}
          >
            <CommentEditor
              active={false}
              autoFocus={autoFocusReply}
              data-testid="comment-editor"
              onChange={(document) => setNewComment(document)}
              onSubmit={handleSubmit}
            />
          </Timeline.Item>
        )}
      </Timeline>
      {hasHiddenReplies && (
        <Button
          className={S.repliesToggle}
          variant="subtle"
          size="compact-sm"
          onClick={() => setIsExpanded(true)}
        >
          {ngettext(
            msgid`${replyCount} reply`,
            `${replyCount} replies`,
            replyCount,
          )}
        </Button>
      )}
    </Stack>
  );
};
