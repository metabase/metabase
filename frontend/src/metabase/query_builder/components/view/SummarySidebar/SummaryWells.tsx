import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { hasFeature } from "metabase/databases";
import {
  ActionIcon,
  Box,
  Icon,
  Menu,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./SummarySidebar.module.css";
import { type SummaryFormulaEdit, SummaryWellInput } from "./SummaryWellInput";
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
  findDimension,
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
  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const canWriteValueFormula =
    database != null && hasFeature(database, "expression-aggregations");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const formulaEdit = getFormulaEdit(definition, editingItemId);
  const editingWellId =
    formulaEdit != null ? getItemWellId(definition, formulaEdit.itemId) : null;

  const handleRemove = (itemId: string) => {
    onChange(removeItem(definition, itemId));
    if (itemId === editingItemId) {
      setEditingItemId(null);
    }
  };

  const renderInput = (wellId: SummaryWellId) => (
    <SummaryWellInput
      base={base}
      database={database}
      wellId={wellId}
      definition={definition}
      formulaEdit={editingWellId === wellId ? formulaEdit : null}
      onChange={onChange}
      onFormulaEditEnd={() => setEditingItemId(null)}
    />
  );

  const renderDimensions = (
    wellId: SummaryWellId,
    dimensions: SummaryDimension[],
  ) =>
    dimensions.map((dimension) => {
      const label = itemLabels.get(dimension.id) ?? "";
      return (
        <WellChip
          key={dimension.id}
          wellId={wellId}
          itemId={dimension.id}
          label={label}
          isEditing={dimension.id === editingItemId}
          onRemove={handleRemove}
        >
          {"expression" in dimension && (
            <FormulaChipLabel
              label={label}
              onEdit={() => setEditingItemId(dimension.id)}
            />
          )}
        </WellChip>
      );
    });

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="rows"
        title={t`Rows`}
        placeholder={t`Drag columns here to group rows`}
        definition={definition}
        draggedItem={draggedItem}
        footer={renderInput("rows")}
      >
        {renderDimensions("rows", definition.rows)}
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={t`Columns`}
        placeholder={t`Drag columns here to split across the top`}
        definition={definition}
        draggedItem={draggedItem}
        footer={renderInput("columns")}
      >
        {renderDimensions("columns", definition.columns)}
      </SummaryWell>
      <SummaryWell
        wellId="values"
        title={t`Values`}
        placeholder={t`Drag columns or metrics here, or type below`}
        definition={definition}
        draggedItem={draggedItem}
        footer={renderInput("values")}
      >
        {definition.values.map((value) => (
          <ValueChip
            key={value.id}
            base={base}
            value={value}
            label={itemLabels.get(value.id) ?? ""}
            isEditing={value.id === editingItemId}
            onChangeOperator={(operatorShortName) =>
              onChange(
                changeValueOperator(definition, value.id, operatorShortName),
              )
            }
            onEditFormula={
              canWriteValueFormula
                ? () => setEditingItemId(value.id)
                : undefined
            }
            onRemove={handleRemove}
          />
        ))}
      </SummaryWell>
    </Box>
  );
}

/** The formula edit in progress, or `null` when nothing is edited or the edited item is gone. */
function getFormulaEdit(
  definition: SummaryDefinition,
  itemId: string | null,
): SummaryFormulaEdit | null {
  if (itemId == null) {
    return null;
  }
  const dimension = findDimension(definition, itemId);
  if (dimension != null) {
    return "expression" in dimension
      ? { itemId, name: dimension.expression.name }
      : null;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  if (value == null || value.type === "metric") {
    return null;
  }
  // a column value becomes a formula named after the formula, unless it's renamed
  return {
    itemId,
    name: value.type === "expression" ? value.expression.name : "",
  };
}

function getItemWellId(
  definition: SummaryDefinition,
  itemId: string,
): SummaryWellId {
  if (definition.rows.some(({ id }) => id === itemId)) {
    return "rows";
  }
  if (definition.columns.some(({ id }) => id === itemId)) {
    return "columns";
  }
  return "values";
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
  isEditing?: boolean;
  children?: ReactNode;
  onRemove: (itemId: string) => void;
};

function WellChip({
  wellId,
  itemId,
  label,
  isEditing = false,
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
      className={cx(S.chip, {
        [S.isDragging]: isDragging,
        [S.chipIsEditing]: isEditing,
      })}
      data-testid="summary-well-item"
      {...attributes}
      {...listeners}
    >
      {children || <span className={S.chipLabel}>{label}</span>}
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

type FormulaChipLabelProps = {
  label: string;
  onEdit?: () => void;
};

function FormulaChipLabel({ label, onEdit }: FormulaChipLabelProps) {
  return (
    <UnstyledButton
      className={S.chipButton}
      aria-label={t`Edit the formula of ${label}`}
      disabled={onEdit == null}
      onClick={onEdit}
    >
      <Icon name="function" size={12} />
      <span className={S.chipLabel}>{label}</span>
    </UnstyledButton>
  );
}

type ValueChipProps = {
  base: SummaryBase;
  value: SummaryValue;
  label: string;
  isEditing: boolean;
  onChangeOperator: (operatorShortName: string) => void;
  /** Omitted when the database can't aggregate with a formula. */
  onEditFormula?: () => void;
  onRemove: (itemId: string) => void;
};

function ValueChip({
  base,
  value,
  label,
  isEditing,
  onChangeOperator,
  onEditFormula,
  onRemove,
}: ValueChipProps) {
  if (value.type === "expression") {
    return (
      <WellChip
        wellId="values"
        itemId={value.id}
        label={label}
        isEditing={isEditing}
        onRemove={onRemove}
      >
        <FormulaChipLabel label={label} onEdit={onEditFormula} />
      </WellChip>
    );
  }

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
      isEditing={isEditing}
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
          {onEditFormula && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="function" />}
                onClick={onEditFormula}
              >
                {t`Edit as formula`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </WellChip>
  );
}
