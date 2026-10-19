import { useMergedRef } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Text,
  UnstyledButton,
} from "metabase/ui";

import type { EventDefinition } from "../../events/types";
import {
  useDragSource,
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
  /** A slot still to fill: drawn dashed, with its placeholder. */
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
  const { isPaletteOpen } = useSegmentDrag();
  const { isActive, isOver, dropProps } = useSegmentDropTarget(dropTarget);
  // Only worth dragging while there's a palette to drop it on.
  const isDraggable = draggableEvent !== undefined && isPaletteOpen;
  const { isDragging, dragRef, dragListeners } = useDragSource(
    isDraggable ? { kind: "event", event: draggableEvent } : undefined,
  );
  const ref = useMergedRef(dropProps.ref, dragRef);
  const dropLabel =
    name === undefined
      ? t`Drop to use this segment`
      : t`Drop to add a condition`;
  const label = isOver ? dropLabel : (name ?? placeholder);

  return (
    <Group
      id={id}
      className={S.root}
      data-empty={empty}
      data-draggable={isDraggable}
      data-dragging={isDragging}
      gap="xs"
      wrap="nowrap"
      p="sm"
      bdrs="sm"
      {...dropProps}
      {...dragListeners}
      ref={ref}
    >
      {isDraggable && (
        <Box
          className={S.grabber}
          c="text-tertiary"
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
          c={name && !isActive ? "text-primary" : "text-tertiary"}
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
    </Group>
  );
};
