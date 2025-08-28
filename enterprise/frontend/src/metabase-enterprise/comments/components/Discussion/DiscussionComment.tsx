// TODO: move Avatar component to metabase/ui
/* eslint-disable no-restricted-imports */
import { Avatar } from "@mantine/core";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import dayjs from "dayjs";
import { useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Group, Spoiler, Text, Timeline, Tooltip, rem } from "metabase/ui";
import { DisableMetabotSidebar } from "metabase-enterprise/documents/components/Editor/extensions/DisableMetabotSidebar";
import { Paragraph } from "metabase-enterprise/documents/components/Editor/extensions/Paragraph";
import { SmartLink } from "metabase-enterprise/documents/components/Editor/extensions/SmartLink/SmartLinkNode";
import type { Comment } from "metabase-types/api";

import S from "./Discussion.module.css";
import {
  DiscussionActionPanel,
  type DiscussionActionPanelProps,
} from "./DiscussionActionPanel";

type DiscussionCommentProps = {
  comment: Comment;
  actionPanelVariant?: DiscussionActionPanelProps["variant"];
  onResolve?: (comment: Comment) => unknown;
  onReaction?: (comment: Comment, emoji: string) => unknown;
  onDelete?: (comment: Comment) => unknown;
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
export function DiscussionComment({
  comment,
  actionPanelVariant,
  onResolve,
  onReaction,
}: DiscussionCommentProps) {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

  const extensions = useMemo(
    () => [
      Paragraph,
      StarterKit.configure({
        paragraph: false,
      }),
      SmartLink.configure({
        HTMLAttributes: { class: "smart-link" },
        siteUrl,
      }),
      Link.configure({
        HTMLAttributes: { class: CS.link },
      }),
      DisableMetabotSidebar,
    ],
    [siteUrl],
  );

  const editorHandle = useEditor(
    {
      extensions,
      content: comment.content,
      editable: false,
      immediatelyRender: true,
    },
    [],
  );

  return (
    <Timeline.Item
      className={S.commentRoot}
      mt="1.25rem"
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
      <DiscussionActionPanel
        variant={actionPanelVariant}
        comment={comment}
        onResolve={onResolve}
        onReaction={onReaction}
      />
      <Group gap="sm" align="center" mb="0.25rem" wrap="nowrap">
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
        maxHeight={lineHeightPx * 3}
        showLabel={t`... more`}
        hideLabel={null}
        classNames={{
          root: S.spoilerRoot,
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
        <EditorContent disabled editor={editorHandle} />
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
