import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { formatCommentDate, getCommentNodeId } from "metabase/comments/utils";
import { useSelector } from "metabase/lib/redux";
import { Avatar, Box, Group, Icon, Text, Timeline, Tooltip } from "metabase/ui";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionActionPanel } from "./DiscussionActionPanel";
import { DiscussionReactions } from "./DiscussionReactions";

type DiscussionCommentProps = {
  canResolve?: boolean;
  comment: Comment;
  onResolve: (comment: Comment) => void;
  onReopen: (comment: Comment) => void;
  onReaction?: (comment: Comment, emoji: string) => void;
  onReactionRemove?: (comment: Comment, emoji: string) => void;
  onDelete?: (comment: Comment) => void;
  onEdit?: (comment: Comment, newContent: DocumentContent) => void;
  onCopyLink?: (comment: Comment) => void;
};

const TOOLTIP_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function DiscussionComment({
  canResolve,
  comment,
  onResolve,
  onReopen,
  onReaction,
  onReactionRemove,
  onDelete,
  onEdit,
  onCopyLink,
}: DiscussionCommentProps) {
  const currentUser = useSelector(getCurrentUser);
  const [isEditing, editingHandler] = useDisclosure(false);
  const location = useLocation();
  const hash = location.hash?.substring(1);
  const isTarget = hash === getCommentNodeId(comment);
  const isCurrentUsersComment =
    currentUser && currentUser.id === comment.creator?.id;

  const handleEditClick = useCallback(() => {
    editingHandler.open();
  }, [editingHandler]);

  const handleEditingSubmit = useCallback(
    (document: DocumentContent) => {
      onEdit?.(comment, document);
      editingHandler.close();
    },
    [comment, onEdit, editingHandler],
  );

  if (comment.deleted_at) {
    return (
      <Timeline.Item
        classNames={{
          item: cx(S.commentRoot, {
            [S.target]: isTarget,
          }),
          itemBullet: S.commentBulletDeleted,
        }}
        id={getCommentNodeId(comment)}
        mt="1.25rem"
        bullet={<Icon name="trash" />}
        aria-current={isTarget ? "location" : undefined}
        data-testid="discussion-comment-deleted"
      >
        <Text size="md" c="text-tertiary" fs="italic">
          {t`This comment was deleted.`}
        </Text>
        <DiscussionActionPanel
          canReact={false}
          canResolve={canResolve}
          comment={comment}
          onCopyLink={onCopyLink}
          onReopen={onReopen}
          onResolve={onResolve}
        />
      </Timeline.Item>
    );
  }

  const commentDate = new Date(comment.created_at);

  return (
    <Timeline.Item
      className={cx(S.commentRoot, {
        [S.target]: isTarget,
      })}
      bullet={<Avatar name={comment.creator?.common_name} />}
      aria-current={isTarget ? "location" : undefined}
      data-testid="discussion-comment"
      id={getCommentNodeId(comment)}
    >
      {!isEditing && (
        <DiscussionActionPanel
          canResolve={canResolve}
          comment={comment}
          onCopyLink={onCopyLink}
          onDelete={isCurrentUsersComment ? onDelete : undefined}
          onEdit={isCurrentUsersComment ? handleEditClick : undefined}
          onReaction={onReaction}
          onReopen={onReopen}
          onResolve={onResolve}
        />
      )}

      <Group gap="sm" align="center" wrap="nowrap">
        <Text fw={700} lh={1.3} truncate>
          {comment.creator?.common_name}
        </Text>

        <Tooltip label={TOOLTIP_DATE_FORMAT.format(commentDate)}>
          <Text
            size="xs"
            c="text-secondary"
            lh={1.1}
            style={{ whiteSpace: "nowrap" }}
          >
            {formatCommentDate(commentDate)}
          </Text>
        </Tooltip>
      </Group>

      <Box mt={isEditing ? "sm" : "xs"}>
        <CommentEditor
          autoFocus
          data-testid="comment-editor"
          initialContent={comment.content}
          onSubmit={handleEditingSubmit}
          readonly={!isEditing}
          onEscape={editingHandler.close}
        />

        {comment.reactions.length > 0 && (
          <DiscussionReactions
            comment={comment}
            onReactionRemove={onReactionRemove}
            onReaction={onReaction}
          />
        )}
      </Box>
    </Timeline.Item>
  );
}
