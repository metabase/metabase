import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Icon,
  Menu,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database, IconName } from "metabase-types/api";

import S from "./SummarySidebar.module.css";
import {
  type SummaryFormulaEdit,
  SummaryWellFormula,
  SummaryWellInput,
  canWriteWellFormula,
} from "./SummaryWellInput";
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
  swapRowsAndColumns,
} from "./utils";

const WELL_ICONS: Record<SummaryWellId, IconName> = {
  rows: "arrow_down",
  columns: "arrow_right",
  values: "sum",
};

/** A new formula being written in a well, starting from what was typed after `=`. */
type SummaryFormulaDraft = {
  wellId: SummaryWellId;
  source: string;
};

type SummaryWellsProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
  onChange: (definition: SummaryDefinition) => void;
};

/**
 * The pivot, laid out like the table it produces: Columns across the top, Rows down the side, and
 * Values in the body. Each well is both a drop target and an input to type columns, metrics, or formulas into.
 */
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formulaDraft, setFormulaDraft] = useState<SummaryFormulaDraft | null>(
    null,
  );
  const formulaEdit = getFormulaEdit(definition, editingItemId);
  const formulaWellId =
    formulaEdit != null
      ? getItemWellId(definition, formulaEdit.itemId)
      : (formulaDraft?.wellId ?? null);
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;

  const handleRemove = (itemId: string) => {
    onChange(removeItem(definition, itemId));
    if (itemId === editingItemId) {
      setEditingItemId(null);
    }
  };

  const handleEditFormula = (itemId: string) => {
    setFormulaDraft(null);
    setEditingItemId(itemId);
  };

  const handleStartFormula = (wellId: SummaryWellId, source: string) => {
    setEditingItemId(null);
    setFormulaDraft({ wellId, source });
  };

  const handleFormulaEnd = () => {
    setEditingItemId(null);
    setFormulaDraft(null);
  };

  const wellProps = {
    base,
    database,
    definition,
    draggedItem,
    formulaWellId,
    onChange,
    onRemove: handleRemove,
    onStartFormula: handleStartFormula,
  };

  // the formula editor spans the frame, under the well it writes to, since the cells are too narrow to type in
  const formulaRow = formulaWellId != null && (
    <Box className={S.pivotFormula}>
      <WellCaption wellId={formulaWellId} />
      <SummaryWellFormula
        base={base}
        database={database}
        wellId={formulaWellId}
        definition={definition}
        formulaEdit={formulaEdit}
        initialSource={formulaDraft?.source ?? ""}
        onChange={onChange}
        onEnd={handleFormulaEnd}
      />
    </Box>
  );

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <Box className={S.pivotFrame}>
        <Box className={S.pivotCorner}>
          <Tooltip label={t`Swap rows and columns`}>
            <ActionIcon
              variant="subtle"
              aria-label={t`Swap rows and columns`}
              disabled={!hasDimensions}
              onClick={() => onChange(swapRowsAndColumns(definition))}
            >
              <Icon name="sync" />
            </ActionIcon>
          </Tooltip>
        </Box>
        <SummaryWell
          {...wellProps}
          wellId="columns"
          className={S.pivotColumns}
          itemIds={definition.columns.map(({ id }) => id)}
        >
          {definition.columns.map((dimension) => (
            <DimensionChip
              key={dimension.id}
              wellId="columns"
              dimension={dimension}
              label={itemLabels.get(dimension.id) ?? ""}
              isEditing={dimension.id === editingItemId}
              onEditFormula={handleEditFormula}
              onRemove={handleRemove}
            />
          ))}
        </SummaryWell>
        {formulaWellId === "columns" && formulaRow}
        <SummaryWell
          {...wellProps}
          wellId="rows"
          className={S.pivotRows}
          itemIds={definition.rows.map(({ id }) => id)}
        >
          {definition.rows.map((dimension) => (
            <DimensionChip
              key={dimension.id}
              wellId="rows"
              dimension={dimension}
              label={itemLabels.get(dimension.id) ?? ""}
              isEditing={dimension.id === editingItemId}
              onEditFormula={handleEditFormula}
              onRemove={handleRemove}
            />
          ))}
        </SummaryWell>
        <SummaryWell
          {...wellProps}
          wellId="values"
          itemIds={definition.values.map(({ id }) => id)}
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
                canWriteWellFormula(database, "values")
                  ? () => handleEditFormula(value.id)
                  : undefined
              }
              onRemove={handleRemove}
            />
          ))}
        </SummaryWell>
        {formulaWellId !== "columns" && formulaRow}
      </Box>
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

function getWellTitle(wellId: SummaryWellId) {
  switch (wellId) {
    case "rows":
      return t`Rows`;
    case "columns":
      return t`Columns`;
    case "values":
      return t`Values`;
  }
}

function WellCaption({ wellId }: { wellId: SummaryWellId }) {
  return (
    <Box className={S.wellCaption}>
      <Icon name={WELL_ICONS[wellId]} size={10} />
      {getWellTitle(wellId)}
    </Box>
  );
}

type SummaryWellProps = {
  base: SummaryBase;
  database: Database | undefined;
  wellId: SummaryWellId;
  className?: string;
  definition: SummaryDefinition;
  draggedItem: SummaryDragItem | null;
  formulaWellId: SummaryWellId | null;
  itemIds: string[];
  children: ReactNode;
  onChange: (definition: SummaryDefinition) => void;
  onRemove: (itemId: string) => void;
  onStartFormula: (wellId: SummaryWellId, source: string) => void;
};

/** A cell of the pivot frame: its chips, followed by an input, like a token field. */
function SummaryWell({
  base,
  database,
  wellId,
  className,
  definition,
  draggedItem,
  formulaWellId,
  itemIds,
  children,
  onChange,
  onRemove,
  onStartFormula,
}: SummaryWellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-well:${wellId}`,
    data: { wellId },
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const canDrop =
    draggedItem != null && canDropOnWell(draggedItem, wellId, definition);
  const isFormulaTarget = formulaWellId === wellId;
  const lastItemId = itemIds.at(-1);

  // clicking the cell, not one of its chips, types into it; clicks in portaled
  // menus and dropdowns bubble here too, but aren't in the cell's DOM
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const { target, currentTarget } = event;
    const isOnCellBackground =
      target instanceof Element &&
      currentTarget.contains(target) &&
      target.closest(`.${S.chip}`) == null;
    if (isOnCellBackground) {
      inputRef.current?.focus();
    }
  };

  const handleRemoveLast = () => {
    if (lastItemId != null) {
      onRemove(lastItemId);
    }
  };

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.well, className, {
        [S.wellAcceptsDrop]: canDrop,
        [S.wellIsOver]: canDrop && isOver,
        [S.wellRejectsDrop]: draggedItem != null && !canDrop,
        [S.wellIsFormulaTarget]: isFormulaTarget,
      })}
      data-testid={`summary-well-${wellId}`}
      onClick={handleClick}
    >
      <WellCaption wellId={wellId} />
      <Box className={S.wellItems}>
        {children}
        {!isFormulaTarget && (
          <SummaryWellInput
            base={base}
            wellId={wellId}
            definition={definition}
            isEmpty={itemIds.length === 0}
            canWriteFormula={canWriteWellFormula(database, wellId)}
            inputRef={inputRef}
            onChange={onChange}
            onStartFormula={(source) => onStartFormula(wellId, source)}
            onRemoveLast={handleRemoveLast}
          />
        )}
      </Box>
    </Box>
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
      title={label}
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

type DimensionChipProps = {
  wellId: SummaryWellId;
  dimension: SummaryDimension;
  label: string;
  isEditing: boolean;
  onEditFormula: (itemId: string) => void;
  onRemove: (itemId: string) => void;
};

function DimensionChip({
  wellId,
  dimension,
  label,
  isEditing,
  onEditFormula,
  onRemove,
}: DimensionChipProps) {
  return (
    <WellChip
      wellId={wellId}
      itemId={dimension.id}
      label={label}
      isEditing={isEditing}
      onRemove={onRemove}
    >
      {"expression" in dimension && (
        <FormulaChipLabel
          label={label}
          onEdit={() => onEditFormula(dimension.id)}
        />
      )}
    </WellChip>
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
