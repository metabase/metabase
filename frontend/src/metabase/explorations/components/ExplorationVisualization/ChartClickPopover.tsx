import { useState } from "react";
import { c, t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { useExploreFurtherMutation } from "metabase/api/exploration";
import { CommentEditor } from "metabase/comments/components";
import { useToast } from "metabase/common/hooks";
import { deriveSubExplorationLink } from "metabase/explorations/sub-explorations";
import {
  Box,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  DocumentContent,
  ExplorationId,
  ExplorationPageNode,
  ExplorationThreadId,
  IconName,
  RowValue,
} from "metabase-types/api";

import S from "./ChartClickPopover.module.css";

/** A clicked chart segment: the value to drill on, a display label, and screen coordinates. */
export interface ChartClickTarget {
  value: RowValue;
  label: string;
  // Display name of the dimension the value belongs to (e.g. "State"), for the comment pill.
  columnName?: string;
  x: number;
  y: number;
}

interface ChartClickPopoverProps {
  explorationId: ExplorationId;
  page: ExplorationPageNode;
  target: ChartClickTarget;
  onClose: () => void;
  onExploredFurther?: (
    childThreadId: ExplorationThreadId,
    parentThreadId: ExplorationThreadId,
  ) => void;
}

/** Only scalars survive the round-trip to the backend filter; coerce anything else to a string. */
function toScalar(value: RowValue): string | number | boolean | null {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

export function ChartClickPopover({
  explorationId,
  page,
  target,
  onClose,
  onExploredFurther,
}: ChartClickPopoverProps) {
  const [mode, setMode] = useState<"menu" | "comment">("menu");
  const [exploreFurther, { isLoading }] = useExploreFurtherMutation();
  const [createComment] = useCreateCommentMutation();
  const [sendToast] = useToast();

  const pageId = String(page.id);

  const handleExploreFurther = async () => {
    // Name the follow-up after the filter that scopes it, e.g.
    // "Birthdate day of week is Tuesday" (the auto name is otherwise unhelpful).
    const drillName = target.columnName
      ? c("{0} is a column name, {1} is the value it is filtered to")
          .t`${target.columnName} is ${target.label}`
      : undefined;
    const { data, error } = await exploreFurther({
      explorationId,
      page_id: page.id,
      value: toScalar(target.value),
      name: drillName,
    });
    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Couldn't start a new investigation`,
      });
    } else {
      // Record which thread this drill was spawned from so the sidebar can
      // nest it under its parent (the backend doesn't persist the link).
      const link = data && deriveSubExplorationLink(data, page.id);
      if (link) {
        onExploredFurther?.(link.childThreadId, link.parentThreadId);
      }
      sendToast({ icon: "bolt", message: t`Exploring ${target.label}…` });
    }
    onClose();
  };

  const handleAddComment = async (content: DocumentContent) => {
    const { error } = await createComment({
      target_id: explorationId,
      target_type: "exploration",
      child_target_id: pageId,
      parent_comment_id: null,
      content,
      // Capture the clicked element in the comment context (same pattern as timelines) so the
      // thread can render a pill showing which segment the comment is about.
      context: {
        segment_value: toScalar(target.value),
        segment_column: target.columnName ?? null,
      },
    });
    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to send comment`,
      });
    } else {
      onClose();
    }
  };

  return (
    <Popover
      opened
      position="bottom-start"
      offset={4}
      withinPortal
      trapFocus={mode === "comment"}
      onChange={(opened) => {
        if (!opened) {
          onClose();
        }
      }}
    >
      <Popover.Target>
        <Box pos="fixed" left={target.x} top={target.y} w={0} h={0} />
      </Popover.Target>
      <Popover.Dropdown p={mode === "menu" ? "xs" : "sm"}>
        {mode === "menu" ? (
          <Stack gap={2} miw="12rem">
            <MenuRow
              icon="breakout"
              label={t`Explore further`}
              disabled={isLoading}
              onClick={handleExploreFurther}
            />
            <MenuRow
              icon="add_comment"
              label={t`Comment`}
              onClick={() => setMode("comment")}
            />
          </Stack>
        ) : (
          <div
            // prevent clicks in the mention menu from dismissing the popover
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <CommentEditor
              className={S.commentEditor}
              placeholder={t`Comment on ${target.label}…`}
              onSubmit={handleAddComment}
              autoFocus="end"
            />
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

interface MenuRowProps {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuRow({ icon, label, disabled, onClick }: MenuRowProps) {
  return (
    <UnstyledButton className={S.menuRow} disabled={disabled} onClick={onClick}>
      <Group gap="sm" wrap="nowrap">
        <Icon name={icon} size={16} />
        <Text fw="bold" size="sm" c="inherit">
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
