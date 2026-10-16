import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./SummaryCanvas.module.css";
import {
  type TemporalUnitOption,
  canDropOnWell,
  getTemporalUnitOptions,
} from "./blocks";
import type {
  SummaryBase,
  SummaryDimension,
  SummaryDragItem,
  SummaryDropTarget,
  SummaryWellId,
} from "./types";

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  hint?: string;
  placeholder: string;
  draggedItem: SummaryDragItem | null;
  isEmpty: boolean;
  children?: ReactNode;
  footer?: ReactNode;
};

/** A drop target for one part of the selected summary: Rows, Columns, or Values. */
export function SummaryWell({
  wellId,
  title,
  hint,
  placeholder,
  draggedItem,
  isEmpty,
  children,
  footer,
}: SummaryWellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-well:${wellId}`,
    data: { target: { type: "well", wellId } satisfies SummaryDropTarget },
  });
  const canDrop = draggedItem != null && canDropOnWell(draggedItem, wellId);

  return (
    <Box>
      <Group gap="xs" mb="xs" align="baseline">
        <Text fw="bold">{title}</Text>
        {hint && (
          <Text size="sm" c="text-secondary">
            {hint}
          </Text>
        )}
      </Group>
      <Box
        ref={setNodeRef}
        className={cx(S.well, {
          [S.wellAcceptsDrop]: canDrop,
          [S.wellIsOver]: canDrop && isOver,
          [S.wellRejectsDrop]: draggedItem != null && !canDrop,
          [S.wellStacked]: wellId === "values",
        })}
        data-testid={`summary-well-${wellId}`}
      >
        {isEmpty ? (
          <Text className={S.wellPlaceholder}>{placeholder}</Text>
        ) : (
          children
        )}
        {footer}
      </Box>
    </Box>
  );
}

type DimensionChipProps = {
  base: SummaryBase;
  wellId: SummaryWellId;
  dimension: SummaryDimension;
  label: string;
  onChangeTemporalUnit: (temporalUnit: string) => void;
  onRemove: () => void;
};

/** A row or column grouping, draggable between wells, with a unit menu for dates. */
export function DimensionChip({
  base,
  wellId,
  dimension,
  label,
  onChangeTemporalUnit,
  onRemove,
}: DimensionChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `summary-chip:${dimension.id}`,
    data: {
      kind: "chip",
      wellId,
      itemId: dimension.id,
      label,
    } satisfies SummaryDragItem,
  });
  const temporalUnits = getTemporalUnitOptions(base, dimension.column);

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.chip, { [S.isDragging]: isDragging })}
      data-testid="summary-well-item"
      {...attributes}
      {...listeners}
    >
      {temporalUnits.length > 0 ? (
        <TemporalUnitMenu
          label={label}
          options={temporalUnits}
          currentUnit={dimension.temporalUnit}
          onChange={onChangeTemporalUnit}
        />
      ) : (
        <span className={S.chipLabel}>{label}</span>
      )}
      <ActionIcon
        size="sm"
        variant="transparent"
        c="inherit"
        aria-label={t`Remove ${label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}

type TemporalUnitMenuProps = {
  label: string;
  options: TemporalUnitOption[];
  currentUnit: string | null;
  onChange: (temporalUnit: string) => void;
};

function TemporalUnitMenu({
  label,
  options,
  currentUnit,
  onChange,
}: TemporalUnitMenuProps) {
  const selectedUnit =
    currentUnit ?? options.find((option) => option.isDefault)?.shortName;
  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Change how ${label} is grouped`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className={S.chipLabel}>{label}</span>
          <Icon name="chevrondown" size={10} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown mah="20rem" style={{ overflowY: "auto" }}>
        {options.map((option) => (
          <Menu.Item
            key={option.shortName}
            rightSection={
              option.shortName === selectedUnit ? <Icon name="check" /> : null
            }
            onClick={() => onChange(option.shortName)}
          >
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
