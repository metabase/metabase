import type { EditorView } from "@codemirror/view";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMount } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { InlineRenameInput } from "metabase/common/components/InlineRenameInput";
import { hasFeature } from "metabase/databases";
import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Icon,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { getCspNonce } from "metabase/utils/csp";
import * as Lib from "metabase-lib";

import { FormulaBarFrame, useFormulaBarSlot } from "../FormulaBar";

import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";
import { type PendingFormulaInput, SummaryWellInput } from "./SummaryWellInput";
import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDragItem,
  SummaryExpression,
  SummaryValue,
  SummaryWellId,
} from "./types";
import {
  addExpressionDimension,
  addExpressionValue,
  canDropOnWell,
  changeValueOperator,
  findDimension,
  getColumnOperatorOptions,
  getFormulaClause,
  getItemColumnName,
  removeItem,
  replaceWithExpression,
} from "./utils";

/**
 * The one formula open in the formula bar: a new one for a well, shown there as a placeholder chip
 * until it's committed, or an existing item's. `key` remounts the bar's editor per open formula.
 */
type ActiveFormula =
  | {
      kind: "new";
      key: number;
      wellId: SummaryWellId;
      source: string;
      name: string;
    }
  | { kind: "edit"; key: number; itemId: string };

/** The item whose formula the bar is editing, and the name it starts with. */
type SummaryFormulaEdit = {
  itemId: string;
  name: string;
};

type SummaryWellsProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
  /** The query `definition` builds, whose result columns the results table shows. */
  summaryQuery: Lib.Query | null;
  itemLabels: Map<string, string>;
  draggedItem: SummaryDragItem | null;
  onChange: (definition: SummaryDefinition) => void;
};

/**
 * The Values and Breakouts drop targets to start. The pivot button on Breakouts, or dragging a
 * column below it, makes it a pivot: a Rows well appears and Breakouts becomes Columns. A pivot
 * made by dragging ends once Rows is empty; one made with the button stays until it's pressed again.
 */
export function SummaryWells({
  base,
  definition,
  summaryQuery,
  itemLabels,
  draggedItem,
  onChange,
}: SummaryWellsProps) {
  const formulaBarSlot = useFormulaBarSlot();
  const wellsRef = useRef<HTMLDivElement>(null);
  const focusWellField = (wellId: SummaryWellId) =>
    wellsRef.current
      ?.querySelector<HTMLElement>(`[data-well-field="${wellId}"]`)
      ?.focus();

  // the summary opens ready to type into its first well
  useMount(() => focusWellField("values"));

  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const canWriteValueFormula =
    database != null && hasFeature(database, "expression-aggregations");
  const [activeFormula, setActiveFormula] = useState<ActiveFormula | null>(
    null,
  );
  const [draftName, setDraftName] = useState("");
  const editingItemId =
    activeFormula?.kind === "edit" ? activeFormula.itemId : null;
  const formulaEdit = getFormulaEdit(definition, editingItemId);
  const [isPivotMode, setIsPivotMode] = useState(
    () => definition.rows.length > 0,
  );
  const isPivot = isPivotMode || definition.rows.length > 0;

  const handleTogglePivot = () => {
    if (isPivot && definition.rows.length > 0) {
      // back to one list of breakouts, rows first since they're the pivot's first grouping
      onChange({
        ...definition,
        rows: [],
        columns: [...definition.rows, ...definition.columns],
      });
    }
    setIsPivotMode(!isPivot);
  };

  // a new formula's well and the keys typed there before the bar's editor mounted; set
  // synchronously on `=`, before React rerenders, so no keystroke slips through
  const pendingInputRef = useRef<{
    wellId: SummaryWellId;
    text: string;
  } | null>(null);

  // each open formula gets a fresh editor, so switching formulas discards the unsaved draft
  const openFormula = (formula: ActiveFormula) => {
    pendingInputRef.current =
      formula.kind === "new" ? { wellId: formula.wellId, text: "" } : null;
    setDraftName("");
    setActiveFormula(formula);
  };

  const getFormulaInput = (wellId: SummaryWellId): PendingFormulaInput => ({
    isPending: () => pendingInputRef.current?.wellId === wellId,
    insert: (text) => {
      if (pendingInputRef.current != null) {
        pendingInputRef.current.text += text;
      }
    },
  });

  const handleEditorCreate = (view: EditorView) => {
    const text = pendingInputRef.current?.text ?? "";
    pendingInputRef.current = null;
    if (text.length > 0) {
      const end = view.state.doc.length;
      view.dispatch({
        changes: { from: end, insert: text },
        selection: { anchor: end + text.length },
      });
    }
  };
  const handleStartFormula = (
    wellId: SummaryWellId,
    source: string,
    name = "",
  ) => openFormula({ kind: "new", key: Date.now(), wellId, source, name });
  // a formula already open, by a double-click's first click or otherwise, isn't reopened, which
  // would discard what's typed; the bar takes focus instead
  const handleEditFormula = (itemId: string) => {
    if (activeFormula?.kind === "edit" && activeFormula.itemId === itemId) {
      focusFormulaBar();
      return;
    }
    openFormula({ kind: "edit", key: Date.now(), itemId });
  };

  /**
   * Tab and Shift+Tab step through a well's formulas, then its field, opening each formula in the
   * bar with the caret at its end. `fromItemId` is the formula in the bar, or `null` for the
   * field. Returns whether focus moved; past the first formula, or forward from the field, the
   * browser's order takes over.
   */
  const stepThroughFormulas = (
    fromDefinition: SummaryDefinition,
    wellId: SummaryWellId,
    fromItemId: string | null,
    direction: "backward" | "forward",
  ): boolean => {
    const itemIds = getFormulaItemIds(
      fromDefinition,
      wellId,
      canWriteValueFormula,
    );
    const fromIndex =
      fromItemId == null ? itemIds.length : itemIds.indexOf(fromItemId);
    const toIndex = direction === "backward" ? fromIndex - 1 : fromIndex + 1;
    if (fromIndex < 0 || toIndex < 0 || toIndex > itemIds.length) {
      return false;
    }
    if (toIndex === itemIds.length) {
      focusWellField(wellId);
      setActiveFormula(null);
      return true;
    }
    handleEditFormula(itemIds[toIndex]);
    return true;
  };

  // commits the formula in the bar if it was changed, then steps from it
  const handleFormulaBarNavigate = (
    direction: "backward" | "forward",
    expression: SummaryExpression | null,
  ): boolean => {
    if (formulaEdit == null) {
      return false;
    }
    const { itemId } = formulaEdit;
    const nextDefinition =
      expression != null
        ? replaceWithExpression(definition, itemId, expression)
        : definition;
    if (nextDefinition !== definition) {
      onChange(nextDefinition);
    }
    const wellId = getItemWellId(nextDefinition, itemId);
    return stepThroughFormulas(nextDefinition, wellId, itemId, direction);
  };

  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const handleRename = (itemId: string, name: string) => {
    setRenamingItemId(null);
    const expression = getItemExpression(definition, itemId);
    if (name.length > 0 && expression != null && name !== expression.name) {
      onChange(
        replaceWithExpression(definition, itemId, { ...expression, name }),
      );
    }
  };
  const getRenameProps = (itemId: string): FormulaChipRenameProps => ({
    isRenaming: renamingItemId === itemId,
    onStartRename: () => setRenamingItemId(itemId),
    onRename: (name) => handleRename(itemId, name),
    onCancelRename: () => setRenamingItemId(null),
  });
  // focus goes back to the formula's well before the bar closes, so the bar doesn't drop it on the
  // page as it collapses
  const closeFormula = () => {
    pendingInputRef.current = null;
    const wellId = getActiveFormulaWellId(
      definition,
      activeFormula,
      formulaEdit,
    );
    if (wellId != null) {
      focusWellField(wellId);
    }
    setActiveFormula(null);
  };

  const handleCommitFormula = (expression: SummaryExpression) => {
    if (activeFormula?.kind === "new") {
      const { wellId } = activeFormula;
      onChange(
        wellId === "values"
          ? addExpressionValue(definition, expression)
          : addExpressionDimension(definition, wellId, expression),
      );
    } else if (formulaEdit != null) {
      onChange(
        replaceWithExpression(definition, formulaEdit.itemId, expression),
      );
    }
    closeFormula();
  };

  const focusFormulaBar = () =>
    formulaBarSlot?.querySelector<HTMLElement>(".cm-content")?.focus();

  const handleRemove = (itemId: string) => {
    onChange(removeItem(definition, itemId));
    if (itemId === editingItemId) {
      setActiveFormula(null);
    }
  };

  const renderField = (wellId: SummaryWellId, items: ReactNode[]) => (
    <SummaryWellInput
      base={base}
      database={database}
      wellId={wellId}
      definition={definition}
      onChange={onChange}
      onStartFormula={(source, name) =>
        handleStartFormula(wellId, source, name)
      }
      formulaInput={getFormulaInput(wellId)}
      onShiftTab={() =>
        stepThroughFormulas(definition, wellId, null, "backward")
      }
    >
      {items}
      {activeFormula?.kind === "new" && activeFormula.wellId === wellId && (
        <PlaceholderChip
          label={draftName || t`New formula`}
          onFocus={focusFormulaBar}
          onRemove={closeFormula}
        />
      )}
    </SummaryWellInput>
  );

  // the bar only exists while a formula chip, or a new formula's placeholder, is selected
  const renderFormulaBar = () => {
    if (activeFormula?.kind === "new") {
      const { wellId } = activeFormula;
      return (
        <SummaryFormulaEditor
          key={activeFormula.key}
          base={base}
          database={database}
          expressionMode={wellId === "values" ? "aggregation" : "expression"}
          initialSource={activeFormula.source}
          initialName={activeFormula.name}
          submitLabel={t`Add`}
          onEditorCreate={handleEditorCreate}
          onNameChange={setDraftName}
          onSubmit={handleCommitFormula}
          onCancel={closeFormula}
        />
      );
    }
    if (activeFormula?.kind === "edit" && formulaEdit != null) {
      const wellId = getItemWellId(definition, formulaEdit.itemId);
      return (
        <SummaryFormulaEditor
          key={activeFormula.key}
          base={base}
          database={database}
          expressionMode={wellId === "values" ? "aggregation" : "expression"}
          initialClause={getFormulaClause(base, definition, formulaEdit.itemId)}
          initialName={formulaEdit.name}
          submitLabel={t`Update`}
          onSubmit={handleCommitFormula}
          onCancel={closeFormula}
          onNavigate={handleFormulaBarNavigate}
        />
      );
    }
    return null;
  };

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
              onEdit={() => handleEditFormula(dimension.id)}
              {...getRenameProps(dimension.id)}
            />
          )}
        </WellChip>
      );
    });

  return (
    <Box ref={wellsRef} className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="values"
        title={isPivot ? t`Values` : t`Summarize by`}
        definition={definition}
        draggedItem={draggedItem}
      >
        {renderField(
          "values",
          definition.values.map((value) => (
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
                  ? () => handleEditFormula(value.id)
                  : undefined
              }
              onRemove={handleRemove}
              {...getRenameProps(value.id)}
            />
          )),
        )}
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={isPivot ? t`Columns` : t`Group by`}
        definition={definition}
        draggedItem={draggedItem}
        action={<PivotToggle isPivot={isPivot} onToggle={handleTogglePivot} />}
      >
        {renderField(
          "columns",
          renderDimensions("columns", definition.columns),
        )}
      </SummaryWell>
      {isPivot ? (
        <SummaryWell
          wellId="rows"
          title={t`Rows`}
          definition={definition}
          draggedItem={draggedItem}
        >
          {renderField("rows", renderDimensions("rows", definition.rows))}
        </SummaryWell>
      ) : (
        <PivotDropZone definition={definition} draggedItem={draggedItem} />
      )}
      {formulaBarSlot &&
        createPortal(
          <>
            <FormulaBarFrame>{renderFormulaBar()}</FormulaBarFrame>
            {formulaEdit != null && (
              <ResultColumnHighlight
                columnName={getItemColumnName(
                  summaryQuery,
                  base.stageIndex,
                  definition,
                  formulaEdit.itemId,
                )}
              />
            )}
          </>,
          formulaBarSlot,
        )}
    </Box>
  );
}

/**
 * Highlights the edited formula's column in the results table, like a spreadsheet outlining the
 * cells a formula writes to. The table belongs to the page, so this styles its cells by column
 * name, the key the table renders on each header and cell.
 */
function ResultColumnHighlight({ columnName }: { columnName: string | null }) {
  if (columnName == null) {
    return null;
  }
  const name = CSS.escape(columnName);
  return (
    // the CSP drops inline styles without the page's nonce
    <style nonce={getCspNonce()}>
      {`
        main [data-header-id="${name}"] {
          background-color: var(--mb-color-background_surface-brand-subtle);
          box-shadow: inset 0 -2px 0 var(--mb-color-core-brand);
        }
        main [data-column-id="${name}"] {
          background-color: var(--mb-color-background_page-highlighted);
        }
      `}
    </style>
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

/** The custom expression behind a formula chip, or `null` for any other item. */
function getItemExpression(
  definition: SummaryDefinition,
  itemId: string,
): SummaryExpression | null {
  const dimension = findDimension(definition, itemId);
  if (dimension != null) {
    return "expression" in dimension ? dimension.expression : null;
  }
  const value = definition.values.find(({ id }) => id === itemId);
  return value?.type === "expression" ? value.expression : null;
}

/** The well of the formula open in the bar, or `null` when none is, or the edited item is gone. */
function getActiveFormulaWellId(
  definition: SummaryDefinition,
  activeFormula: ActiveFormula | null,
  formulaEdit: SummaryFormulaEdit | null,
): SummaryWellId | null {
  if (activeFormula?.kind === "new") {
    return activeFormula.wellId;
  }
  return formulaEdit != null
    ? getItemWellId(definition, formulaEdit.itemId)
    : null;
}

/**
 * A well's items that open in the formula bar, in order: every value but metrics, which aren't
 * formulas, and the custom columns among the groupings.
 */
function getFormulaItemIds(
  definition: SummaryDefinition,
  wellId: SummaryWellId,
  canWriteValueFormula: boolean,
): string[] {
  if (wellId === "values") {
    return canWriteValueFormula
      ? definition.values
          .filter((value) => value.type !== "metric")
          .map(({ id }) => id)
      : [];
  }
  return definition[wellId]
    .filter((dimension) => "expression" in dimension)
    .map(({ id }) => id);
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

// clicks on these keep their own behavior instead of focusing the well's field
const INTERACTIVE_SELECTOR =
  "button, input, a, [role='button'], [contenteditable='true']";
const FIELD_SELECTOR = "input";

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  definition: SummaryDefinition;
  draggedItem: SummaryDragItem | null;
  /** A control at the end of the title row. */
  action?: ReactNode;
  children: ReactNode;
};

/** A drop target that's also one big input: clicking anywhere outside its chips focuses its field. */
function SummaryWell({
  wellId,
  title,
  definition,
  draggedItem,
  action,
  children,
}: SummaryWellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `summary-well:${wellId}`,
    data: { wellId },
  });
  const canDrop =
    draggedItem != null && canDropOnWell(draggedItem, wellId, definition);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    const field =
      event.currentTarget.querySelector<HTMLElement>(FIELD_SELECTOR);
    if (field) {
      // keep the mousedown from blurring the field we're about to focus
      event.preventDefault();
      field.focus();
    }
  };

  return (
    <Card
      ref={setNodeRef}
      className={cx(S.well, {
        [S.wellAcceptsDrop]: canDrop,
        [S.wellIsOver]: canDrop && isOver,
        [S.wellRejectsDrop]: draggedItem != null && !canDrop,
      })}
      radius="lg"
      shadow="xs_outline"
      p="md"
      data-testid={`summary-well-${wellId}`}
      onMouseDown={handleMouseDown}
    >
      <Flex className={S.wellHeader}>
        <Text className={S.wellTitle}>{title}</Text>
        {action}
      </Flex>
      {children}
    </Card>
  );
}

type PivotToggleProps = {
  isPivot: boolean;
  onToggle: () => void;
};

function PivotToggle({ isPivot, onToggle }: PivotToggleProps) {
  const label = isPivot ? t`Back to breakouts` : t`Pivot into rows and columns`;
  return (
    <Tooltip label={label}>
      <ActionIcon
        className={S.pivotToggle}
        variant="subtle"
        size="sm"
        selected={isPivot}
        aria-label={label}
        aria-pressed={isPivot}
        onClick={onToggle}
      >
        <Icon name="pivot_table" />
      </ActionIcon>
    </Tooltip>
  );
}

type PivotDropZoneProps = {
  definition: SummaryDefinition;
  draggedItem: SummaryDragItem | null;
};

/**
 * The space below the last well. Dragging a column into it shows a Create pivot target; dropping
 * there puts the column in Rows.
 */
function PivotDropZone({ definition, draggedItem }: PivotDropZoneProps) {
  const canDrop =
    draggedItem != null && canDropOnWell(draggedItem, "rows", definition);
  const { setNodeRef, isOver } = useDroppable({
    id: "summary-well:pivot",
    data: { wellId: "rows" },
    disabled: !canDrop,
  });

  return (
    <Box
      ref={setNodeRef}
      className={S.pivotDropZone}
      data-testid="summary-pivot-drop-zone"
    >
      {/* mounted for the whole drag, so entering and leaving the zone fade it in and out */}
      {canDrop && (
        <Box
          className={S.pivotDropTarget}
          data-over={isOver}
          aria-hidden={!isOver}
        >
          <Icon name="pivot_table" />
          {t`Create pivot`}
        </Box>
      )}
    </Box>
  );
}

type WellChipProps = {
  wellId: SummaryWellId;
  itemId: string;
  label: string;
  isEditing: boolean;
  children?: ReactNode;
  onRemove: (itemId: string) => void;
};

function WellChip({
  wellId,
  itemId,
  label,
  isEditing,
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
      <ChipRemoveButton
        label={t`Remove ${label}`}
        onClick={() => onRemove(itemId)}
      />
    </Box>
  );
}

type PlaceholderChipProps = {
  label: string;
  onFocus: () => void;
  onRemove: () => void;
};

/** Where a new formula will land: a dashed chip, named live from the formula bar, until it's committed. */
function PlaceholderChip({ label, onFocus, onRemove }: PlaceholderChipProps) {
  return (
    <Box
      className={cx(S.chip, S.chipPlaceholder, S.chipIsEditing)}
      data-testid="summary-well-placeholder"
    >
      <UnstyledButton
        className={S.chipButton}
        aria-label={t`Edit the new formula in the formula bar`}
        onClick={onFocus}
      >
        <Icon name="function" size={12} />
        <span className={S.chipLabel}>{label}</span>
      </UnstyledButton>
      <ChipRemoveButton label={t`Cancel the new formula`} onClick={onRemove} />
    </Box>
  );
}

type ChipRemoveButtonProps = {
  label: string;
  onClick: () => void;
};

function ChipRemoveButton({ label, onClick }: ChipRemoveButtonProps) {
  return (
    <ActionIcon
      className={S.chipRemove}
      size="sm"
      variant="subtle"
      c="inherit"
      aria-label={label}
      onClick={onClick}
    >
      <Icon name="close" size={12} />
    </ActionIcon>
  );
}

/** Double-clicking a formula chip's name edits it in place, without touching the formula. */
type FormulaChipRenameProps = {
  isRenaming: boolean;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
};

type FormulaChipLabelProps = FormulaChipRenameProps & {
  label: string;
  onEdit?: () => void;
};

function FormulaChipLabel({
  label,
  onEdit,
  isRenaming,
  onStartRename,
  onRename,
  onCancelRename,
}: FormulaChipLabelProps) {
  if (isRenaming) {
    return (
      <span className={S.chipButton}>
        <Icon name="function" size={12} />
        <InlineRenameInput
          className={S.chipRenameInput}
          initialValue={label}
          aria-label={t`Name of ${label}`}
          onCommit={onRename}
          onCancel={onCancelRename}
        />
      </span>
    );
  }
  return (
    <UnstyledButton
      className={S.chipButton}
      aria-label={t`Edit the formula of ${label}`}
      disabled={onEdit == null}
      onClick={onEdit}
      onDoubleClick={onStartRename}
    >
      <Icon name="function" size={12} />
      <span className={S.chipLabel}>{label}</span>
    </UnstyledButton>
  );
}

type ValueChipProps = FormulaChipRenameProps & {
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
  ...renameProps
}: ValueChipProps) {
  return (
    <WellChip
      wellId="values"
      itemId={value.id}
      label={label}
      isEditing={isEditing}
      onRemove={onRemove}
    >
      {value.type === "expression" && (
        <FormulaChipLabel
          label={label}
          onEdit={onEditFormula}
          {...renameProps}
        />
      )}
      {(value.type === "count" || value.type === "metric") && (
        <>
          <Icon name={value.type === "metric" ? "metric" : "sum"} size={12} />
          <span className={S.chipLabel}>{label}</span>
        </>
      )}
      {value.type === "column" && (
        <ColumnValueMenu
          base={base}
          column={value.column}
          operatorShortName={value.operatorShortName}
          label={label}
          onChangeOperator={onChangeOperator}
          onEditFormula={onEditFormula}
        />
      )}
    </WellChip>
  );
}

type ColumnValueMenuProps = {
  base: SummaryBase;
  column: Lib.ColumnMetadata;
  operatorShortName: string;
  label: string;
  onChangeOperator: (operatorShortName: string) => void;
  onEditFormula?: () => void;
};

/** A column value's chip: picks how the column is aggregated, or opens it as a formula. */
function ColumnValueMenu({
  base,
  column,
  operatorShortName,
  label,
  onChangeOperator,
  onEditFormula,
}: ColumnValueMenuProps) {
  return (
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
        {getColumnOperatorOptions(base, column).map((option) => (
          <Menu.Item
            key={option.shortName}
            rightSection={
              option.shortName === operatorShortName ? (
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
  );
}
