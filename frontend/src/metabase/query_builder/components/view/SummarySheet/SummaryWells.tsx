import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Icon,
  Menu,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./SummarySheet.module.css";
import { SummaryValuesInput } from "./SummaryValuesInput";
import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDragItem,
  SummaryValue,
  SummaryWellId,
} from "./types";
import {
  canDropOnWell,
  changeValueOperator,
  getColumnOperatorOptions,
  removeItem,
} from "./utils";

type SummaryWellsProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
  onChange: (definition: SummaryDefinition) => void;
};

/** The Rows, Columns, and Values drop targets that define the pivot. */
export function SummaryWells({
  base,
  definition,
  itemLabels,
  draggedItem,
  onChange,
}: SummaryWellsProps) {
  const handleRemove = (itemId: string) =>
    onChange(removeItem(definition, itemId));

  const renderDimensions = (
    wellId: SummaryWellId,
    dimensions: SummaryDimension[],
  ) =>
    dimensions.map((dimension) => (
      <WellChip
        key={dimension.id}
        wellId={wellId}
        itemId={dimension.id}
        label={itemLabels.get(dimension.id) ?? ""}
        onRemove={handleRemove}
      />
    ));

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="rows"
        title={t`Rows`}
        placeholder={t`Drag columns here to group rows`}
        definition={definition}
        draggedItem={draggedItem}
      >
        {renderDimensions("rows", definition.rows)}
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={t`Columns`}
        placeholder={t`Drag columns here to split across the top`}
        definition={definition}
        draggedItem={draggedItem}
      >
        {renderDimensions("columns", definition.columns)}
      </SummaryWell>
      <SummaryWell
        wellId="values"
        title={t`Values`}
        placeholder={t`Drag columns or metrics here, or type a metric name below`}
        definition={definition}
        draggedItem={draggedItem}
        footer={
          <SummaryValuesInput
            base={base}
            definition={definition}
            onChange={onChange}
          />
        }
      >
        {definition.values.map((value) => (
          <ValueChip
            key={value.id}
            base={base}
            value={value}
            label={itemLabels.get(value.id) ?? ""}
            onChangeOperator={(operatorShortName) =>
              onChange(
                changeValueOperator(definition, value.id, operatorShortName),
              )
            }
            onRemove={handleRemove}
          />
        ))}
      </SummaryWell>
    </Box>
  );
}

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  placeholder: string;
  definition: SummaryDefinition;
  draggedItem: SummaryDragItem | null;
  children: ReactNode[];
  footer?: ReactNode;
};

function SummaryWell({
  wellId,
  title,
  placeholder,
  definition,
  draggedItem,
  children,
  footer,
}: SummaryWellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-well:${wellId}`,
    data: { wellId },
  });
  const canDrop =
    draggedItem != null && canDropOnWell(draggedItem, wellId, definition);

  return (
    <Stack gap="xs">
      <Text fw="bold">{title}</Text>
      <Box
        ref={setNodeRef}
        className={cx(S.well, {
          [S.wellAcceptsDrop]: canDrop,
          [S.wellIsOver]: canDrop && isOver,
          [S.wellRejectsDrop]: draggedItem != null && !canDrop,
        })}
        data-testid={`summary-well-${wellId}`}
      >
        {children.length > 0 ? (
          children
        ) : (
          <Text className={S.wellPlaceholder}>{placeholder}</Text>
        )}
        {footer && <Box className={S.valuesInput}>{footer}</Box>}
      </Box>
    </Stack>
  );
}

type WellChipProps = {
  wellId: SummaryWellId;
  itemId: string;
  label: string;
  children?: ReactNode;
  onRemove: (itemId: string) => void;
};

function WellChip({
  wellId,
  itemId,
  label,
  children,
  onRemove,
}: WellChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `summary-chip:${itemId}`,
    data: { kind: "chip", wellId, itemId, label } satisfies SummaryDragItem,
  });

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.chip, { [S.isDragging]: isDragging })}
      data-testid="summary-well-item"
      {...attributes}
      {...listeners}
    >
      {children ?? <span className={S.chipLabel}>{label}</span>}
      <ActionIcon
        size="sm"
        variant="transparent"
        c="inherit"
        aria-label={t`Remove ${label}`}
        onClick={() => onRemove(itemId)}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}

type ValueChipProps = {
  base: SummaryBase;
  value: SummaryValue;
  label: string;
  onChangeOperator: (operatorShortName: string) => void;
  onRemove: (itemId: string) => void;
};

function ValueChip({
  base,
  value,
  label,
  onChangeOperator,
  onRemove,
}: ValueChipProps) {
  if (value.type !== "column") {
    return (
      <WellChip
        wellId="values"
        itemId={value.id}
        label={label}
        onRemove={onRemove}
      >
        <Icon name={value.type === "metric" ? "metric" : "sum"} size={12} />
        <span className={S.chipLabel}>{label}</span>
      </WellChip>
    );
  }

  const operatorOptions = getColumnOperatorOptions(base, value.column);

  return (
    <WellChip
      wellId="values"
      itemId={value.id}
      label={label}
      onRemove={onRemove}
    >
      <Menu position="bottom-start">
        <Menu.Target>
          <UnstyledButton
            className={S.chipButton}
            aria-label={t`Change how ${label} is calculated`}
          >
            <span className={S.chipLabel}>{label}</span>
            <Icon name="chevrondown" size={10} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {operatorOptions.map((option) => (
            <Menu.Item
              key={option.shortName}
              rightSection={
                option.shortName === value.operatorShortName ? (
                  <Icon name="check" />
                ) : null
              }
              onClick={() => onChangeOperator(option.shortName)}
            >
              {option.displayName}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </WellChip>
  );
}
