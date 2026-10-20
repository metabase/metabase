import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Menu, Text, Tooltip } from "metabase/ui";

import { useDragSource } from "../../segments/drag-context";
import { isEventSegment } from "../../segments/to-event-definition";
import type { PaletteSegment } from "../../segments/types";

import S from "./PaletteSegmentItem.module.css";

type PaletteSegmentItemProps = {
  segment: PaletteSegment;
  /** Makes a click use the segment, as a drop would. */
  onSelect?: () => void;
  onEditDraft?: () => void;
  onSaveDraft?: () => void;
  onDiscardDraft?: () => void;
};

/**
 * A segment in the palette, dragged by its whole row. Only event segments
 * drag for now; there's nowhere to drop a people segment yet.
 */
export const PaletteSegmentItem = ({
  segment,
  onSelect,
  onEditDraft,
  onSaveDraft,
  onDiscardDraft,
}: PaletteSegmentItemProps) => {
  const isDraggable = isEventSegment(segment);
  const { isDragging, dragRef, dragListeners } = useDragSource(
    isDraggable ? { kind: "segment", segment } : undefined,
  );

  return (
    <Group
      className={S.item}
      role={onSelect !== undefined ? "button" : undefined}
      tabIndex={onSelect !== undefined ? 0 : undefined}
      data-status={segment.status}
      data-dragging={isDragging}
      data-draggable={isDraggable}
      data-selectable={onSelect !== undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect !== undefined && event.key === "Enter") {
          onSelect();
        }
      }}
      gap="xs"
      wrap="nowrap"
      pl="xs"
      pr="xs"
      py="xs"
      bdrs="sm"
      {...dragListeners}
      ref={dragRef}
    >
      {isDraggable && (
        <Box c="text-tertiary" display="flex" style={{ flexShrink: 0 }}>
          <Icon name="grabber" size={12} />
        </Box>
      )}
      {segment.status === "saved" && (
        <Icon name="segment" c="core-filter" style={{ flexShrink: 0 }} />
      )}
      <Tooltip
        label={segment.description}
        disabled={!segment.description}
        openDelay={400}
        position="right"
      >
        <Text
          truncate
          flex={1}
          miw={0}
          c={segment.status === "draft" ? "text-secondary" : undefined}
        >
          {segment.name}
        </Text>
      </Tooltip>
      {segment.status === "draft" && (
        <Text c="text-tertiary" style={{ flexShrink: 0 }}>
          {t`Draft`}
        </Text>
      )}
      {segment.status === "draft" && (
        // The row's own click and drag must not start from the menu.
        <Box
          display="flex"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={t`Draft options`}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="pencil" />}
                onClick={onEditDraft}
              >
                {t`Edit draft`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="bookmark" />}
                onClick={onSaveDraft}
              >
                {t`Save as a segment…`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="trash" />}
                onClick={onDiscardDraft}
              >
                {t`Discard draft`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}
    </Group>
  );
};
