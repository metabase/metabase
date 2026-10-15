import { t } from "ttag";

import { ActionIcon, Group, Icon, Text, UnstyledButton } from "metabase/ui";

import { useSegmentDropTarget } from "../../segments/drag-context";
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
  onEdit,
  onRemove,
}: EventDefinitionSummaryProps) => {
  const { isActive, isOver, dropProps } = useSegmentDropTarget(dropTarget);
  const label = isOver ? t`Drop to use this segment` : (name ?? placeholder);

  return (
    <Group
      id={id}
      className={S.root}
      gap="xs"
      wrap="nowrap"
      p="sm"
      bdrs="sm"
      {...dropProps}
    >
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
