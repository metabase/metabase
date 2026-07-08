import { useMemo, useState } from "react";
import { t } from "ttag";

import { useCreateCommentMutation } from "metabase/api/comment";
import { useExploreFurtherMutation } from "metabase/api/exploration";
import { CommentEditor } from "metabase/comments/components";
import { useToast } from "metabase/common/hooks";
import {
  Box,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { ClickObject } from "metabase/visualizations/types";
import type {
  DocumentContent,
  ExplorationBlockNodeType,
  ExplorationId,
  ExplorationPageNode,
  ExplorationQueryType,
  IconName,
} from "metabase-types/api";

import S from "./ChartClickPopover.module.css";
import { canExploreFurther, getExploreFurtherFilters } from "./utils";

interface ChartClickPopoverProps {
  explorationId: ExplorationId;
  page: ExplorationPageNode;
  clicked: ClickObject;
  blockType: ExplorationBlockNodeType;
  queryType: ExplorationQueryType;
  onClose: () => void;
}

export function ChartClickPopover({
  explorationId,
  page,
  clicked,
  blockType,
  queryType,
  onClose,
}: ChartClickPopoverProps) {
  const [mode, setMode] = useState<"menu" | "comment">("menu");
  const [exploreFurther, { isLoading }] = useExploreFurtherMutation();
  const [createComment] = useCreateCommentMutation();
  const [sendToast] = useToast();

  const pageId = String(page.id);

  const isExploreFurtherEnabled = canExploreFurther(
    clicked,
    blockType,
    queryType,
  );

  const exploreFilters = getExploreFurtherFilters(clicked);

  const { x, y } = useMemo(() => {
    if (clicked.event) {
      return {
        x: clicked.event.clientX,
        y: clicked.event.clientY,
      };
    }
    if (clicked.element) {
      const rect = clicked.element.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
      };
    }
    return {
      x: 0,
      y: 0,
    };
  }, [clicked]);

  const handleExploreFurther = async () => {
    const { error } = await exploreFurther({
      id: explorationId,
      page_id: page.id,
      explore_filters: exploreFilters,
    });
    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Couldn't start a new investigation`,
      });
    } else {
      sendToast({ icon: "bolt", message: t`Exploring further…` });
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
      // context: {
      //   segment_value: toScalar(target.value),
      //   segment_column: target.columnName ?? null,
      // },
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
        <Box pos="fixed" left={x} top={y} w={0} h={0} />
      </Popover.Target>
      <Popover.Dropdown p={mode === "menu" ? "xs" : "sm"}>
        {mode === "menu" ? (
          <Stack gap={2} miw="12rem">
            {isExploreFurtherEnabled && (
              <MenuRow
                icon="breakout"
                label={t`Explore further`}
                disabled={isLoading}
                onClick={handleExploreFurther}
              />
            )}
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
              placeholder={t`Comment on this…`}
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
