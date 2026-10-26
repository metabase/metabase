import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import type { EventDefinition } from "../../events/types";
import {
  useSegmentDrag,
  useSegmentDropTarget,
} from "../../segments/drag-context";
import type { PaletteSegment } from "../../segments/types";

import S from "./EventDefinitionSummary.module.css";

export type SegmentDropTarget = {
  accepts: (segment: PaletteSegment) => boolean;
  onDrop: (segment: PaletteSegment) => void;
};

const NO_DROP_TARGET: SegmentDropTarget = {
  accepts: () => false,
  onDrop: () => undefined,
};

type EventDefinitionSummaryProps = {
  id?: string;
  name: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  removeLabel?: string;
  /** Lets a palette segment be dropped on the summary to fill it in. */
  dropTarget?: SegmentDropTarget;
  /**
   * A slot still to fill: drawn dashed, with its placeholder and a button
   * that shows and hides the segments panel.
   */
  empty?: boolean;
  /** The event shown, so it can be dragged to the palette as a draft. */
  draggableEvent?: EventDefinition;
  onEdit: () => void;
  onRemove?: () => void;
};

/** A collapsed event definition: its name, with edit and remove buttons. */
export const EventDefinitionSummary = ({
  id,
  name,
  placeholder,
  disabled,
  removeLabel = t`Remove`,
  dropTarget = NO_DROP_TARGET,
  empty = false,
  draggableEvent,
  onEdit,
  onRemove,
}: EventDefinitionSummaryProps) => {
  const { isPaletteOpen, onTogglePalette, startEventDrag, endDrag } =
    useSegmentDrag();
  const segmentsLabel = isPaletteOpen
    ? t`Hide event segments`
    : t`Show event segments`;
  const { isActive, isOver, dropProps } = useSegmentDropTarget(dropTarget);
  const dropLabel =
    name === undefined
      ? t`Drop to use this segment`
      : t`Drop to add a condition`;
  const label = isOver ? dropLabel : (name ?? placeholder);
  // Only worth dragging while there's a palette to drop it on.
  const isDraggable = draggableEvent !== undefined && isPaletteOpen;

  return (
    <Group
      id={id}
      className={S.root}
      data-empty={empty}
      data-draggable={isDraggable}
      draggable={isDraggable}
      gap="xs"
      wrap="nowrap"
      p="sm"
      bdrs="sm"
      onDragStart={(event) => {
        if (draggableEvent !== undefined) {
          startEventDrag(draggableEvent, event);
        }
      }}
      onDragEnd={endDrag}
      {...dropProps}
    >
      {isDraggable && (
        <Box
          className={S.grabber}
          c="text-disabled"
          display="flex"
          style={{ flexShrink: 0 }}
        >
          <Icon name="grabber" size={12} />
        </Box>
      )}
      <UnstyledButton
        className={S.editButton}
        flex={1}
        miw={0}
        disabled={disabled}
        onClick={onEdit}
      >
        <Text
          truncate
          c={name && !isActive ? "text-primary" : "text-disabled"}
          fw={isOver ? "bold" : undefined}
        >
          {label}
        </Text>
      </UnstyledButton>
      {onRemove && (
        <ActionIcon
          variant="subtle"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <Icon name="close" />
        </ActionIcon>
      )}
      {empty && (
        <Tooltip label={segmentsLabel}>
          <ActionIcon
            variant="subtle"
            aria-label={segmentsLabel}
            aria-pressed={isPaletteOpen}
            disabled={disabled}
            onClick={onTogglePalette}
          >
            <Icon name="segment" />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
};
