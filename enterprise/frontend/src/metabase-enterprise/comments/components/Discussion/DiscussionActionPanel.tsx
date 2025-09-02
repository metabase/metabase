import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Paper,
  Popover,
  Tooltip,
  rem,
} from "metabase/ui";
import { EmojiPicker } from "metabase-enterprise/documents/components/EmojiPicker/EmojiPicker";
import type { Comment } from "metabase-types/api";

import S from "./Discussion.module.css";

export type DiscussionActionPanelProps = {
  variant?: "comment" | "discussion";
  comment: Comment;
  onResolve?: (comment: Comment) => unknown;
  onReopen?: (comment: Comment) => unknown;
  onReaction?: (comment: Comment, emoji: string) => unknown;
  onDelete?: (comment: Comment) => unknown;
  onEdit?: (comment: Comment) => unknown;
  onCopyLink?: (comment: Comment) => unknown;
};

const ACTION_ICON_SIZE = "md";
const ACTION_BUTTON_STYLE_PROPS = {
  w: "100%",
  p: "0.25rem",
  variant: "inverse",
  size: "xs",
  radius: "xs",
} as const;

export function DiscussionActionPanel({
  variant = "comment",
  comment,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  onCopyLink,
}: DiscussionActionPanelProps) {
  const [emojiPickerOpened, setEmojiPickerOpened] = useState(false);
  const [popoverOpened, setPopoverOpened] = useState(false);
  const hasMoreActions = Boolean(onReopen || onDelete || onEdit || onCopyLink);

  return (
    <Paper
      className={cx(S.actionPanel, {
        // [S.visibleOnCommentHover]: variant === "comment",
        // [S.visibleOnDiscussionHover]: variant === "discussion",
        [S.visibleOnCommentHover]: true,
        [S.visible]: popoverOpened || emojiPickerOpened,
      })}
      p="0.125rem"
    >
      <Group gap="0">
        <Popover
          position="bottom-end"
          opened={emojiPickerOpened}
          onChange={setEmojiPickerOpened}
        >
          <Popover.Target>
            <Tooltip label={t`Add reaction`} disabled={emojiPickerOpened}>
              <ActionIcon
                size={ACTION_ICON_SIZE}
                onClick={() => setEmojiPickerOpened((opened) => !opened)}
              >
                {/* TODO: add reaction icon */}
                <Icon name="bolt" />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <EmojiPicker onEmojiSelect={(emoji) => alert(emoji.emoji)} />
          </Popover.Dropdown>
        </Popover>
        {variant === "discussion" && (
          <Tooltip label={comment.is_resolved ? t`Re-open` : t`Resolve`}>
            <ActionIcon
              size={ACTION_ICON_SIZE}
              onClick={() =>
                comment.is_resolved ? onReopen?.(comment) : onResolve?.(comment)
              }
            >
              <Icon name={comment.is_resolved ? "undo" : "check"} />
            </ActionIcon>
          </Tooltip>
        )}
        {hasMoreActions && (
          <Popover
            opened={popoverOpened}
            onChange={setPopoverOpened}
            width={rem(140)}
            position="bottom-end"
          >
            <Popover.Target>
              <Tooltip label={t`More actions`} disabled={popoverOpened}>
                <ActionIcon
                  size={ACTION_ICON_SIZE}
                  onClick={() => setPopoverOpened((opened) => !opened)}
                >
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Paper p="0.25rem">
                {onCopyLink && (
                  <Button
                    {...ACTION_BUTTON_STYLE_PROPS}
                    leftSection={<Icon name="link" c="text-primary" />}
                    onClick={() => {
                      onCopyLink?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Copy link`}
                  </Button>
                )}
                {onEdit && (
                  <Button
                    {...ACTION_BUTTON_STYLE_PROPS}
                    leftSection={<Icon name="pencil" c="text-primary" />}
                    onClick={() => {
                      onEdit?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Edit`}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    {...ACTION_BUTTON_STYLE_PROPS}
                    leftSection={<Icon name="trash" c="text-primary" />}
                    onClick={() => {
                      onDelete?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Delete`}
                  </Button>
                )}
              </Paper>
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>
    </Paper>
  );
}
