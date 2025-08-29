import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
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
  const [popoverOpened, popoverHandler] = useDisclosure(false);

  return (
    <Paper
      className={cx(S.actionPanel, {
        // [S.visibleOnCommentHover]: variant === "comment",
        // [S.visibleOnDiscussionHover]: variant === "discussion",
        [S.visibleOnCommentHover]: true,
        [S.visible]: popoverOpened,
      })}
      p="0.125rem"
    >
      <Group gap="0">
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
        <Popover
          onOpen={popoverHandler.open}
          onClose={popoverHandler.close}
          width={rem(200)}
          position="bottom-end"
        >
          <Popover.Target>
            <Tooltip label={t`More actions`} disabled={popoverOpened}>
              <ActionIcon size={ACTION_ICON_SIZE}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Paper p="0.25rem">
              {variant === "discussion" && (
                <Button
                  {...ACTION_BUTTON_STYLE_PROPS}
                  leftSection={<Icon name="link" c="text-primary" />}
                  onClick={() => onCopyLink?.(comment)}
                >
                  {t`Copy link to discussion`}
                </Button>
              )}
              <Button
                {...ACTION_BUTTON_STYLE_PROPS}
                leftSection={<Icon name="pencil" c="text-primary" />}
                onClick={() => onEdit?.(comment)}
              >
                {t`Edit comment`}
              </Button>
              <Button
                {...ACTION_BUTTON_STYLE_PROPS}
                leftSection={<Icon name="trash" c="text-primary" />}
                onClick={() => onDelete?.(comment)}
              >
                {t`Delete comment`}
              </Button>
            </Paper>
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Paper>
  );
}
