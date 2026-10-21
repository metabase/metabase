import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
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
import {
  SUMMARY_VALUE_FORMATS,
  type SummaryBase,
  type SummaryDefinition,
  type SummaryDimension,
  type SummaryDimensionWellId,
  type SummaryDragItem,
  type SummaryValue,
  type SummaryValueFormat,
  type SummaryValueFormats,
  type SummaryWellId,
} from "./types";
import {
  canDropOnWell,
  changeValueOperator,
  findDimension,
  getColumnOperatorOptions,
  pivotSummary,
  removeItem,
  swapRowsAndColumns,
  unpivotSummary,
} from "./utils";

const WELL_ICONS: Record<SummaryWellId, IconName> = {
  rows: "arrow_down",
  columns: "arrow_right",
  values: "sum",
};

const GROUP_BY_ICON: IconName = "list";

/** A new formula being written in a well, starting from what was typed after `=`. */
type SummaryFormulaDraft = {
  wellId: SummaryWellId;
  source: string;
};

/** What every prototype layout of the wells is given; they differ only in how they lay the wells out. */
export type SummaryLayoutProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
  valueFormats: SummaryValueFormats;
  onChange: (definition: SummaryDefinition) => void;
  onChangeValueFormat: (itemId: string, format: SummaryValueFormat) => void;
};

/**
 * Prototype variant A: the summary's groupings and values side by side, like the table it produces.
 * Pivoting opens Columns across the top, so the wells are laid out like the pivot table: Columns across
 * the top, Rows down the side, and Values in the body. Each well is both a drop target and an input to
 * type columns, metrics, or formulas into.
 */
export function SummaryWells({
  base,
  definition,
  itemLabels,
  draggedItem,
  valueFormats,
  onChange,
  onChangeValueFormat,
}: SummaryLayoutProps) {
  const database = useSummaryDatabase(base);
  const { isPivot } = definition;
  const editing = useSummaryWellEditing(definition, onChange, {
    isColumnsVisible: isPivot,
  });
  const { formulaWellId } = editing;

  const wellProps = {
    base,
    database,
    definition,
    isPivot,
    draggedItem,
    formulaWellId,
    onChange,
    onRemove: editing.handleRemove,
    onStartFormula: editing.handleStartFormula,
  };
  const chipProps = {
    base,
    database,
    definition,
    itemLabels,
    editingItemId: editing.editingItemId,
    onChange,
    onEditFormula: editing.handleEditFormula,
    onRemove: editing.handleRemove,
  };

  // the formula editor spans the frame, under the well it writes to, since the cells are too narrow to type in
  const formulaRow = formulaWellId != null && (
    <SummaryWellFormulaRow
      base={base}
      database={database}
      definition={definition}
      editing={editing}
      caption={<WellCaption wellId={formulaWellId} isPivot={isPivot} />}
      onChange={onChange}
    />
  );

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <Box className={S.frame}>
        <Box
          className={cx(S.collapse, { [S.collapseIsOpen]: isPivot })}
          data-testid="summary-pivot-header"
        >
          <Box className={cx(S.collapseContent, S.pivotHeaderCells)}>
            <Box className={S.pivotCorner} />
            <SummaryWell
              {...wellProps}
              wellId="columns"
              className={S.pivotColumns}
              isDisabled={!isPivot}
            >
              <SummaryDimensionChips {...chipProps} wellId="columns" />
            </SummaryWell>
          </Box>
        </Box>
        {formulaWellId === "columns" && formulaRow}
        <Box className={S.pivotBody}>
          <SummaryWell {...wellProps} wellId="rows" className={S.pivotRows}>
            <SummaryDimensionChips {...chipProps} wellId="rows" />
          </SummaryWell>
          <SummaryWell {...wellProps} wellId="values">
            <SummaryValueChips
              {...chipProps}
              valueFormats={valueFormats}
              onChangeValueFormat={onChangeValueFormat}
            />
          </SummaryWell>
        </Box>
        {formulaWellId !== "columns" && formulaRow}
      </Box>
    </Box>
  );
}

type SummaryPivotActionsProps = {
  definition: SummaryDefinition;
  onChange: (definition: SummaryDefinition) => void;
};

/** Pivot and Unpivot, plus swapping rows and columns once pivoted; shown in the sidebar's header. */
export function SummaryPivotActions({
  definition,
  onChange,
}: SummaryPivotActionsProps) {
  const { isPivot } = definition;
  const hasDimensions =
    definition.rows.length > 0 || definition.columns.length > 0;

  return (
    <Flex align="center" gap="xs">
      {isPivot && (
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
      )}
      <Tooltip
        label={
          isPivot
            ? t`Group by a single list of columns again`
            : t`Split the values across columns, as a pivot table`
        }
      >
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<Icon name="pivot_table" />}
          aria-pressed={isPivot}
          onClick={() =>
            onChange(
              isPivot ? unpivotSummary(definition) : pivotSummary(definition),
            )
          }
        >
          {isPivot ? t`Unpivot` : t`Pivot`}
        </Button>
      </Tooltip>
    </Flex>
  );
}

/** The database the summary queries, for checking which formulas it supports; `undefined` while loading. */
export function useSummaryDatabase(base: SummaryBase): Database | undefined {
  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  return database;
}

export type SummaryWellEditing = ReturnType<typeof useSummaryWellEditing>;

/** Which item's formula is being edited, or which well a new formula is being written in. */
export function useSummaryWellEditing(
  definition: SummaryDefinition,
  onChange: (definition: SummaryDefinition) => void,
  { isColumnsVisible }: { isColumnsVisible: boolean },
) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formulaDraft, setFormulaDraft] = useState<SummaryFormulaDraft | null>(
    null,
  );
  const formulaEdit = getFormulaEdit(definition, editingItemId);
  const draftWellId = formulaDraft?.wellId ?? null;
  // a formula started in Columns is dropped once Columns closes, e.g. on unpivoting
  const visibleDraftWellId =
    draftWellId === "columns" && !isColumnsVisible ? null : draftWellId;
  const formulaWellId =
    formulaEdit != null
      ? getItemWellId(definition, formulaEdit.itemId)
      : visibleDraftWellId;

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

  return {
    editingItemId,
    formulaDraft: visibleDraftWellId != null ? formulaDraft : null,
    formulaEdit,
    formulaWellId,
    handleRemove,
    handleEditFormula,
    handleStartFormula,
    handleFormulaEnd,
  };
}

type SummaryWellFormulaRowProps = {
  base: SummaryBase;
  database: Database | undefined;
  definition: SummaryDefinition;
  editing: SummaryWellEditing;
  caption: ReactNode;
  onChange: (definition: SummaryDefinition) => void;
};

/** The formula editor of the well being written in, laid out full width under it. */
export function SummaryWellFormulaRow({
  base,
  database,
  definition,
  editing,
  caption,
  onChange,
}: SummaryWellFormulaRowProps) {
  const { formulaWellId, formulaEdit, formulaDraft } = editing;
  if (formulaWellId == null) {
    return null;
  }
  return (
    <Box className={S.formulaRow}>
      {caption}
      <SummaryWellFormula
        base={base}
        database={database}
        wellId={formulaWellId}
        definition={definition}
        formulaEdit={formulaEdit}
        initialSource={formulaDraft?.source ?? ""}
        onChange={onChange}
        onEnd={editing.handleFormulaEnd}
      />
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

function getWellTitle(wellId: SummaryWellId, isPivot: boolean) {
  switch (wellId) {
    case "rows":
      return isPivot ? t`Rows` : t`Group by`;
    case "columns":
      return t`Columns`;
    case "values":
      return t`Values`;
  }
}

type WellCaptionProps = {
  wellId: SummaryWellId;
  isPivot: boolean;
};

function WellCaption({ wellId, isPivot }: WellCaptionProps) {
  const iconName =
    wellId === "rows" && !isPivot ? GROUP_BY_ICON : WELL_ICONS[wellId];
  return (
    <Box className={S.wellCaption}>
      <Icon name={iconName} size={10} />
      {getWellTitle(wellId, isPivot)}
    </Box>
  );
}

type SummaryWellProps = {
  base: SummaryBase;
  database: Database | undefined;
  wellId: SummaryWellId;
  className?: string;
  /** Replaces the well's icon and title. */
  caption?: ReactNode;
  /** The input's placeholder while the well is empty. */
  emptyPlaceholder?: string;
  definition: SummaryDefinition;
  isPivot: boolean;
  /** A well that's collapsed out of view takes no drops. */
  isDisabled?: boolean;
  draggedItem: SummaryDragItem | null;
  formulaWellId: SummaryWellId | null;
  children: ReactNode;
  onChange: (definition: SummaryDefinition) => void;
  onRemove: (itemId: string) => void;
  onStartFormula: (wellId: SummaryWellId, source: string) => void;
};

/** A drop target holding a well's chips, followed by an input, like a token field. */
export function SummaryWell({
  base,
  database,
  wellId,
  className,
  caption,
  emptyPlaceholder,
  definition,
  isPivot,
  isDisabled = false,
  draggedItem,
  formulaWellId,
  children,
  onChange,
  onRemove,
  onStartFormula,
}: SummaryWellProps) {
  const itemIds = definition[wellId].map(({ id }) => id);
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-well:${wellId}`,
    data: { wellId },
    disabled: isDisabled,
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
      {caption ?? <WellCaption wellId={wellId} isPivot={isPivot} />}
      <Box className={S.wellItems}>
        {children}
        {!isFormulaTarget && (
          <SummaryWellInput
            base={base}
            wellId={wellId}
            definition={definition}
            isEmpty={itemIds.length === 0}
            emptyPlaceholder={emptyPlaceholder}
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

type SummaryChipsProps = {
  base: SummaryBase;
  database: Database | undefined;
  definition: SummaryDefinition;
  itemLabels: Map<string, string>;
  editingItemId: string | null;
  onChange: (definition: SummaryDefinition) => void;
  onEditFormula: (itemId: string) => void;
  onRemove: (itemId: string) => void;
};

type SummaryDimensionChipsProps = SummaryChipsProps & {
  wellId: SummaryDimensionWellId;
};

/** The chips of the groupings in Rows (Group by) or Columns. */
export function SummaryDimensionChips({
  wellId,
  definition,
  itemLabels,
  editingItemId,
  onEditFormula,
  onRemove,
}: SummaryDimensionChipsProps) {
  return definition[wellId].map((dimension) => (
    <DimensionChip
      key={dimension.id}
      wellId={wellId}
      dimension={dimension}
      label={itemLabels.get(dimension.id) ?? ""}
      isEditing={dimension.id === editingItemId}
      onEditFormula={onEditFormula}
      onRemove={onRemove}
    />
  ));
}

type SummaryValueChipsProps = SummaryChipsProps & {
  /** Set to let values be formatted from their chip's menu. */
  valueFormats?: SummaryValueFormats;
  onChangeValueFormat?: (itemId: string, format: SummaryValueFormat) => void;
};

/** The chips of the values, with menus to change how each is calculated, and optionally formatted. */
export function SummaryValueChips({
  base,
  database,
  definition,
  itemLabels,
  editingItemId,
  valueFormats,
  onChange,
  onChangeValueFormat,
  onEditFormula,
  onRemove,
}: SummaryValueChipsProps) {
  const canEditFormula = canWriteWellFormula(database, "values");
  return definition.values.map((value) => (
    <ValueChip
      key={value.id}
      base={base}
      value={value}
      label={itemLabels.get(value.id) ?? ""}
      isEditing={value.id === editingItemId}
      format={valueFormats?.[value.id] ?? "number"}
      onChangeOperator={(operatorShortName) =>
        onChange(changeValueOperator(definition, value.id, operatorShortName))
      }
      onChangeFormat={
        onChangeValueFormat
          ? (format) => onChangeValueFormat(value.id, format)
          : undefined
      }
      onEditFormula={canEditFormula ? () => onEditFormula(value.id) : undefined}
      onRemove={onRemove}
    />
  ));
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

const VALUE_ICONS: Record<SummaryValue["type"], IconName | null> = {
  count: "sum",
  column: null,
  metric: "metric",
  expression: "function",
};

function getValueFormatLabel(format: SummaryValueFormat) {
  switch (format) {
    case "number":
      return t`Number`;
    case "currency":
      return t`Currency`;
    case "percent":
      return t`Percent`;
  }
}

/** Metrics aren't formulas, and neither is a plain count. */
function getFormulaEditLabel(value: SummaryValue) {
  switch (value.type) {
    case "expression":
      return t`Edit formula`;
    case "column":
      return t`Edit as formula`;
    case "count":
    case "metric":
      return null;
  }
}

type ValueChipProps = {
  base: SummaryBase;
  value: SummaryValue;
  label: string;
  isEditing: boolean;
  format: SummaryValueFormat;
  onChangeOperator: (operatorShortName: string) => void;
  /** Omitted when values can't be formatted from their chips. */
  onChangeFormat?: (format: SummaryValueFormat) => void;
  /** Omitted when the database can't aggregate with a formula. */
  onEditFormula?: () => void;
  onRemove: (itemId: string) => void;
};

function ValueChip({
  base,
  value,
  label,
  isEditing,
  format,
  onChangeOperator,
  onChangeFormat,
  onEditFormula,
  onRemove,
}: ValueChipProps) {
  const operatorOptions =
    value.type === "column" ? getColumnOperatorOptions(base, value.column) : [];
  const formulaEditLabel = getFormulaEditLabel(value);
  const canEditFormula = onEditFormula != null && formulaEditLabel != null;
  const hasMenu = value.type === "column" || onChangeFormat != null;
  const iconName = VALUE_ICONS[value.type];
  const content = (
    <>
      {iconName && <Icon name={iconName} size={12} />}
      <span className={S.chipLabel}>{label}</span>
    </>
  );

  if (!hasMenu) {
    return (
      <WellChip
        wellId="values"
        itemId={value.id}
        label={label}
        isEditing={isEditing}
        onRemove={onRemove}
      >
        {value.type === "expression" ? (
          <FormulaChipLabel label={label} onEdit={onEditFormula} />
        ) : (
          content
        )}
      </WellChip>
    );
  }

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
            aria-label={
              value.type === "column"
                ? t`Change how ${label} is calculated`
                : t`Options for ${label}`
            }
          >
            {content}
            <Icon name="chevrondown" size={10} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {operatorOptions.map((option) => (
            <Menu.Item
              key={option.shortName}
              rightSection={
                value.type === "column" &&
                option.shortName === value.operatorShortName ? (
                  <Icon name="check" />
                ) : null
              }
              onClick={() => onChangeOperator(option.shortName)}
            >
              {option.displayName}
            </Menu.Item>
          ))}
          {canEditFormula && (
            <>
              {operatorOptions.length > 0 && <Menu.Divider />}
              <Menu.Item
                leftSection={<Icon name="function" />}
                onClick={onEditFormula}
              >
                {formulaEditLabel}
              </Menu.Item>
            </>
          )}
          {onChangeFormat && (
            <>
              {(operatorOptions.length > 0 || canEditFormula) && (
                <Menu.Divider />
              )}
              <Menu.Label>{t`Show as`}</Menu.Label>
              {SUMMARY_VALUE_FORMATS.map((option) => (
                <Menu.Item
                  key={option}
                  rightSection={
                    option === format ? <Icon name="check" /> : null
                  }
                  onClick={() => onChangeFormat(option)}
                >
                  {getValueFormatLabel(option)}
                </Menu.Item>
              ))}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </WellChip>
  );
}
