import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { useCallback } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Avatar, Box, Group, Icon, Text, Timeline, Tooltip } from "metabase/ui";
import { getCommentNodeId } from "metabase-enterprise/comments/utils";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import { DiscussionActionPanel } from "./DiscussionActionPanel";
import { DiscussionReactions } from "./DiscussionReactions";

type DiscussionCommentProps = {
  canResolve?: boolean;
  comment: Comment;
  onResolve?: (comment: Comment) => void;
  onReopen?: (comment: Comment) => void;
  onReaction?: (comment: Comment, emoji: string) => void;
  onReactionRemove?: (comment: Comment, emoji: string) => void;
  onDelete?: (comment: Comment) => void;
  onEdit?: (comment: Comment, newContent: DocumentContent) => void;
  onCopyLink?: (comment: Comment) => void;
};

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
  const isCurrentUsersComment = currentUser.id === comment.creator.id;

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

  if (comment.is_deleted) {
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
      >
        <Text size="md" c="text-disabled" fs="italic">
          {t`This comment was deleted.`}
        </Text>
        <DiscussionActionPanel
          canResolve={canResolve}
          comment={comment}
          onResolve={onResolve}
          onCopyLink={onCopyLink}
        />
      </Timeline.Item>
    );
  }

  return (
    <Timeline.Item
      className={cx(S.commentRoot, {
        [S.target]: isTarget,
      })}
      bullet={<Avatar name={comment.creator.common_name} />}
      id={getCommentNodeId(comment)}
    >
      {!isEditing && (
        <DiscussionActionPanel
          canResolve={canResolve}
          comment={comment}
          onResolve={onResolve}
          onReopen={onReopen}
          onReaction={onReaction}
          onDelete={isCurrentUsersComment ? onDelete : undefined}
          onEdit={isCurrentUsersComment ? handleEditClick : undefined}
          onCopyLink={onCopyLink}
        />
      )}

      <Group gap="sm" align="center" wrap="nowrap">
        <Text fw={700} lh={1.3} truncate>
          {comment.creator.common_name}
        </Text>

        <Tooltip
          label={dayjs(comment.created_at).format("MMM D, YYYY, h:mm A")}
        >
          <Text
            size="xs"
            c="text-medium"
            lh={1.1}
            style={{ whiteSpace: "nowrap" }}
          >
            {formatCommentDate(comment.created_at)}
          </Text>
        </Tooltip>
      </Group>

      <Box mt={isEditing ? "sm" : "xs"}>
        <CommentEditor
          autoFocus
          initialContent={comment.content}
          onSubmit={handleEditingSubmit}
          readonly={!isEditing}
        />
        <DiscussionReactions
          comment={comment}
          onReactionRemove={onReactionRemove}
          onReaction={onReaction}
        />
      </Box>
    </Timeline.Item>
  );
}

function formatCommentDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();

  const oneDay = 24 * 60 * 60 * 1000;
  const is24hAgo = now.getTime() - date.getTime() < oneDay;

  if (is24hAgo) {
    return dayjs(date).fromNow();
  }

  return dayjs(date).format("MMM D");
}
