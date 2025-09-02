import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

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
  canResolve?: boolean;
  comment: Comment;
  onResolve?: (comment: Comment) => void;
  onReopen?: (comment: Comment) => void;
  onReaction?: (comment: Comment, emoji: string) => void;
  onDelete?: (comment: Comment) => void;
  onEdit?: (comment: Comment) => void;
  onCopyLink?: (comment: Comment) => void;
};

const ACTION_ICON_SIZE = "md";

export function DiscussionActionPanel({
  canResolve,
  comment,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  onCopyLink,
}: DiscussionActionPanelProps) {
  const [popoverOpened, setPopoverOpened] = useState(false);
  const hasMoreActions = Boolean(onReopen || onDelete || onEdit || onCopyLink);

  return (
    <Paper
      className={cx(S.actionPanel, {
        [S.visible]: popoverOpened,
      })}
      p="0.125rem"
    >
      <Group gap={0}>
        {/*<Tooltip label={t`Add reaction`}>
           TODO: add emoji picker
          <ActionIcon
            size={ACTION_ICON_SIZE}
            onClick={() => onReaction?.(comment, "👍")}
          >
             TODO: add reaction icon
            <Icon name="bolt" />
          </ActionIcon>
        </Tooltip> */}

        {canResolve && (
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
