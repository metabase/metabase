import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { useCallback } from "react";
import { useLocation } from "react-use";
import { t } from "ttag";

import { Box, Group, Icon, Text, Timeline, Tooltip } from "metabase/ui";
import { getCommentNodeId } from "metabase-enterprise/comments/utils";
import type { Comment, DocumentContent } from "metabase-types/api";

import { CommentEditor } from "../CommentEditor";

import S from "./Discussion.module.css";
import {
  DiscussionActionPanel,
  type DiscussionActionPanelProps,
} from "./DiscussionActionPanel";
import { DiscussionAvatar } from "./DiscussionAvatar";

type DiscussionCommentProps = {
  comment: Comment;
  actionPanelVariant?: DiscussionActionPanelProps["variant"];
  onResolve?: (comment: Comment) => unknown;
  onReopen?: (comment: Comment) => unknown;
  onReaction?: (comment: Comment, emoji: string) => unknown;
  onDelete?: (comment: Comment) => unknown;
  onEdit?: (comment: Comment, newContent: DocumentContent) => unknown;
  onCopyLink?: (comment: Comment) => unknown;
};

export function DiscussionComment({
  comment,
  actionPanelVariant,
  onResolve,
  onReopen,
  onReaction,
  onDelete,
  onEdit,
  onCopyLink,
}: DiscussionCommentProps) {
  const [isEditing, editingHandler] = useDisclosure(false);
  const location = useLocation();
  const hash = location.hash?.substring(1);
  const isTarget = hash === getCommentNodeId(comment);

  const handleEditClick = useCallback(() => {
    editingHandler.open();
  }, [editingHandler]);

  const handleEditingSubmit = (document: DocumentContent) => {
    onEdit?.(comment, document);
    editingHandler.close();
  };

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
      </Timeline.Item>
    );
  }

  return (
    <Timeline.Item
      className={cx(S.commentRoot, {
        [S.target]: isTarget,
      })}
      bullet={<DiscussionAvatar user={comment.creator} />}
      id={getCommentNodeId(comment)}
    >
      {!isEditing && (
        <DiscussionActionPanel
          variant={actionPanelVariant}
          comment={comment}
          onResolve={onResolve}
          onReopen={onReopen}
          onReaction={onReaction}
          onDelete={onDelete}
          onEdit={handleEditClick}
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

      <Box mt={isEditing ? "sm" : 0}>
        <CommentEditor
          initialContent={comment.content}
          onSubmit={handleEditingSubmit}
          readonly={!isEditing}
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
