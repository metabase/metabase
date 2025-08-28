// TODO: move Timeline, Spoiler, and Avatar components to metabase/ui
/* eslint-disable no-restricted-imports */
import { Avatar, Spoiler, Timeline } from "@mantine/core";
import dayjs from "dayjs";
import { t } from "ttag";

import { Group, Text, Tooltip, rem } from "metabase/ui";
import type { Comment } from "metabase-types/api";

import S from "./DiscussionComment.module.css";

type DiscussionCommentProps = {
  comment: Comment;
};

const avatarColors = [
  "var(--mb-base-color-lobster-40)",
  "var(--mb-base-color-flamingo-40)",
  "var(--mb-base-color-mango-40)",
  "var(--mb-base-color-orion-40)",
  "var(--mb-base-color-dubloon-40)",
  "var(--mb-base-color-palm-40)",
  "var(--mb-base-color-seafoam-40)",
  "var(--mb-base-color-octopus-40)",
];

const lineHeightPx = 20;
export function DiscussionComment({ comment }: DiscussionCommentProps) {
  return (
    <Timeline.Item
      mt="1.25rem"
      // TODO: fix this when migrating component to metabase/ui
      style={{ "--item-border-color": "var(--mb-color-border)" }}
      bullet={
        <Avatar
          variant="filled"
          size={rem(24)}
          name={comment.creator.common_name}
          color="initials"
          allowedInitialsColors={avatarColors}
        />
      }
    >
      <Group gap="sm" align="center" mb="0.25rem" wrap="nowrap">
        <Text fw={700} lh={1.1} truncate>
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
        maxHeight={lineHeightPx * 3}
        showLabel={t`... more`}
        hideLabel={null}
        classNames={{
          content: S.spoilerContent,
          control: S.spoilerControl,
        }}
        // We can't move this to CSS since control position is set via style attribute
        styles={{
          control: {
            inset: "auto 0px 0px auto",
            lineHeight: rem(lineHeightPx),
          },
        }}
      >
        <Text lh={rem(lineHeightPx)}>{comment.content_str_stup}</Text>
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
