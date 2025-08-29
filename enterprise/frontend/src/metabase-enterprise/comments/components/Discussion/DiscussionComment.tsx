import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Group,
  Icon,
  Spoiler,
  Text,
  Timeline,
  Tooltip,
  rem,
} from "metabase/ui";
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
};

const lineHeightPx = 17;
export function DiscussionComment({
  comment,
  actionPanelVariant,
  onResolve,
  onReopen,
  onReaction,
  onDelete,
  onEdit,
}: DiscussionCommentProps) {
  const [isEditing, editingHandler] = useDisclosure(false);
  const [expanded, setExpanded] = useState(false);

  const handleEditClick = useCallback(() => {
    editingHandler.open();
    setExpanded(true);
  }, [editingHandler]);

  const handleEditingSubmit = (document: DocumentContent) => {
    onEdit?.(comment, document);
    editingHandler.close();
  };

  if (comment.is_deleted) {
    return (
      <Timeline.Item
        classNames={{
          item: S.commentRoot,
          itemBullet: S.commentBulletDeleted,
        }}
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
      className={S.commentRoot}
      bullet={<DiscussionAvatar user={comment.creator} />}
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

      <Spoiler
        mb="0"
        // TODO: remove +14. Currently it's related to Paragraph margin style, which is 14px
        maxHeight={lineHeightPx * 3 + 14}
        showLabel={t`... more`}
        hideLabel={null}
        classNames={{
          root: S.spoilerRoot,
          content: S.spoilerContent,
          control: S.spoilerControl,
        }}
        expanded={expanded}
        onExpandedChange={setExpanded}
        // We can't move this to CSS since control position is set via style attribute
        styles={{
          control: {
            inset: "auto 0px 0px auto",
            lineHeight: rem(lineHeightPx),
          },
        }}
      >
        <CommentEditor
          initialContent={comment.content}
          onSubmit={handleEditingSubmit}
          readonly={!isEditing}
        />
      </Spoiler>
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
