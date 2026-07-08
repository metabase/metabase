import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import { EmojiPicker } from "metabase/common/components/EmojiPicker";
import {
  ActionIcon,
  Group,
  Icon,
  Menu,
  Paper,
  Popover,
  Tooltip,
  rem,
} from "metabase/ui";
import type { Comment } from "metabase-types/api";

import S from "./Discussion.module.css";

export type DiscussionActionPanelProps = {
  canReact?: boolean;
  canResolve?: boolean;
  comment: Comment;
  onCopyLink?: (comment: Comment) => void;
  onDelete?: (comment: Comment) => void;
  onEdit?: (comment: Comment) => void;
  onReaction?: (comment: Comment, emoji: string) => void;
  onReopen: (comment: Comment) => void;
  onResolve: (comment: Comment) => void;
};

const ACTION_ICON_SIZE = "md";

export function DiscussionActionPanel({
  canReact = true,
  canResolve,
  comment,
  onCopyLink,
  onDelete,
  onEdit,
  onReaction,
  onReopen,
  onResolve,
}: DiscussionActionPanelProps) {
  const [emojiPickerOpened, setEmojiPickerOpened] = useState(false);
  const [popoverOpened, setPopoverOpened] = useState(false);
  const hasMoreActions = Boolean(onReopen || onDelete || onEdit || onCopyLink);

  const handleReaction = useCallback(
    (emoji: { emoji: string; label: string }) => {
      onReaction?.(comment, emoji.emoji);
      setEmojiPickerOpened(false);
    },
    [comment, onReaction],
  );

  return (
    <Paper
      className={cx(S.actionPanel, {
        [S.visible]: popoverOpened || emojiPickerOpened,
      })}
      data-testid="comment-action-panel"
      p="0.125rem"
    >
      <Group gap="0">
        {canReact && (
          <Popover
            position="bottom-end"
            opened={emojiPickerOpened}
            onChange={setEmojiPickerOpened}
          >
            <Popover.Target>
              <Tooltip label={t`Add reaction`} disabled={emojiPickerOpened}>
                <ActionIcon
                  aria-label={t`Add reaction`}
                  size={ACTION_ICON_SIZE}
                  onClick={() => setEmojiPickerOpened((opened) => !opened)}
                >
                  <Icon name="smile" />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <EmojiPicker onEmojiSelect={handleReaction} />
            </Popover.Dropdown>
          </Popover>
        )}
        {canResolve && (
          <Tooltip label={comment.is_resolved ? t`Re-open` : t`Resolve`}>
            <ActionIcon
              data-testid={
                comment.is_resolved
                  ? "comment-action-panel-reopen"
                  : "comment-action-panel-resolve"
              }
              aria-label={comment.is_resolved ? t`Re-open` : t`Resolve`}
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
                  data-testid="comment-action-panel-more-actions"
                  aria-label={t`More actions`}
                  size={ACTION_ICON_SIZE}
                  onClick={() => setPopoverOpened((opened) => !opened)}
                >
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>

            <Popover.Dropdown p="xs">
              <Menu>
                {onCopyLink && (
                  <Menu.Item
                    leftSection={<Icon name="link" />}
                    onClick={() => {
                      onCopyLink?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Copy link`}
                  </Menu.Item>
                )}

                {onEdit && (
                  <Menu.Item
                    leftSection={<Icon name="pencil" />}
                    onClick={() => {
                      onEdit?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Edit`}
                  </Menu.Item>
                )}

                {onDelete && (
                  <Menu.Item
                    leftSection={<Icon name="trash" />}
                    data-testid="comment-action-panel-delete"
                    onClick={() => {
                      onDelete?.(comment);
                      setPopoverOpened(false);
                    }}
                  >
                    {t`Delete`}
                  </Menu.Item>
                )}
              </Menu>
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>
    </Paper>
  );
}
