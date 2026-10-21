import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import { useSegmentDrag } from "../../segments/drag-context";
import type { PaletteSegment } from "../../segments/types";

import S from "./PaletteSegmentItem.module.css";

type PaletteSegmentItemProps = {
  segment: PaletteSegment;
  /** Makes a click use the segment, as a drop would. */
  onSelect?: () => void;
  onEditDraft?: () => void;
  onSaveDraft?: () => void;
  onDiscardDraft?: () => void;
  /** A saved segment's definition, shown below the row when expanded. */
  definition?: ReactNode;
};

/**
 * A segment in the palette, dragged by its whole row. With a definition, a
 * chevron expands it; so does a click on the row when it has no use of its own.
 */
export const PaletteSegmentItem = ({
  segment,
  onSelect,
  onEditDraft,
  onSaveDraft,
  onDiscardDraft,
  definition,
}: PaletteSegmentItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDefinition = definition !== undefined;
  const toggleExpanded = () => setIsExpanded((expanded) => !expanded);
  const handleClick = onSelect ?? (hasDefinition ? toggleExpanded : undefined);
  const expandLabel = isExpanded ? t`Hide definition` : t`Show definition`;
  const { dragging, hovering, startDrag, endDrag, setHovering } =
    useSegmentDrag();
  const isDragging =
    dragging?.kind === "segment" && dragging.segment.key === segment.key;

  return (
    <Stack
      className={S.item}
      role={handleClick !== undefined ? "button" : undefined}
      tabIndex={handleClick !== undefined ? 0 : undefined}
      aria-expanded={hasDefinition ? isExpanded : undefined}
      data-status={segment.status}
      data-dragging={isDragging}
      data-selectable={handleClick !== undefined}
      draggable
      onClick={handleClick}
      onKeyDown={(event) => {
        if (handleClick !== undefined && event.key === "Enter") {
          handleClick();
        }
      }}
      onMouseEnter={() => setHovering(segment)}
      onMouseLeave={() => {
        if (hovering?.key === segment.key) {
          setHovering(null);
        }
      }}
      gap={0}
      bdrs="md"
      onDragStart={(event) => startDrag(segment, event)}
      onDragEnd={() => {
        endDrag();
        setHovering(null);
      }}
    >
      <Group gap="sm" wrap="nowrap" p="xs">
        <Box c="text-tertiary" display="flex" style={{ flexShrink: 0 }}>
          <Icon name="grabber" size={12} />
        </Box>
        {segment.status === "saved" && (
          <Icon name="segment" className={S.segmentIcon} aria-hidden />
        )}
        <Tooltip
          label={segment.description}
          disabled={!segment.description}
          openDelay={400}
          position="right"
        >
          <Text truncate flex={1} miw={0}>
            {segment.name}
          </Text>
        </Tooltip>
        {segment.status === "draft" && (
          <Text c="text-tertiary" style={{ flexShrink: 0 }}>
            {t`Draft`}
          </Text>
        )}
        {segment.status === "draft" && (
          // The row's own click (edit or use the draft) must not fire from the menu.
          <Box
            display="flex"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
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
        {hasDefinition && (
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={expandLabel}
            onClick={(event) => {
              // The row's own click may use the segment instead.
              event.stopPropagation();
              toggleExpanded();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Icon name={isExpanded ? "chevronup" : "chevrondown"} />
          </ActionIcon>
        )}
      </Group>
      {hasDefinition && isExpanded && (
        // Reading the definition shouldn't use the segment.
        <Box
          px="sm"
          pb="sm"
          pt="xs"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {definition}
        </Box>
      )}
    </Stack>
  );
};
