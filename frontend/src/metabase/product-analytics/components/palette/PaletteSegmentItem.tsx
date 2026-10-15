import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Menu, Text, Tooltip } from "metabase/ui";

import { useSegmentDrag } from "../../segments/drag-context";
import type { PaletteSegment } from "../../segments/types";

import S from "./PaletteSegmentItem.module.css";

type PaletteSegmentItemProps = {
  segment: PaletteSegment;
  onSaveDraft?: () => void;
  onDiscardDraft?: () => void;
};

/** A segment in the palette, dragged by its whole row. */
export const PaletteSegmentItem = ({
  segment,
  onSaveDraft,
  onDiscardDraft,
}: PaletteSegmentItemProps) => {
  const { dragging, startDrag, endDrag } = useSegmentDrag();
  const isDragging = dragging?.key === segment.key;

  return (
    <Group
      className={S.item}
      data-status={segment.status}
      data-dragging={isDragging}
      draggable
      gap="xs"
      wrap="nowrap"
      pl="xs"
      pr="xs"
      py="xs"
      bdrs="sm"
      onDragStart={(event) => startDrag(segment, event)}
      onDragEnd={endDrag}
    >
      <Box c="text-tertiary" display="flex" style={{ flexShrink: 0 }}>
        <Icon name="grabber" size={12} />
      </Box>
      <Tooltip
        label={segment.description}
        disabled={!segment.description}
        openDelay={400}
        position="right"
      >
        <Text size="sm" truncate flex={1} miw={0}>
          {segment.name}
        </Text>
      </Tooltip>
      {segment.status === "draft" && (
        <Text size="xs" c="text-tertiary" style={{ flexShrink: 0 }}>
          {t`Draft`}
        </Text>
      )}
      {segment.status === "draft" && (
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
      )}
    </Group>
  );
};
