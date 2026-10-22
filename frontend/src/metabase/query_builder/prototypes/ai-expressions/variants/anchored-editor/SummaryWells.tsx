import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
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
import * as Lib from "metabase-lib";

import type {
  SummaryBase,
  SummaryDefinition,
  SummaryDimension,
  SummaryDragItem,
  SummaryExpression,
  SummaryValue,
  SummaryWellId,
} from "../../../../components/view/SummarySidebar/types";
import {
  addExpressionDimension,
  addExpressionValue,
  canDropOnWell,
  changeValueOperator,
  findDimension,
  getColumnOperatorOptions,
  getFormulaClause,
  removeItem,
  replaceWithExpression,
} from "../../../../components/view/SummarySidebar/utils";

import { FormulaAnchor, type FormulaPanel } from "./FormulaAnchor";
import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";
import { SummaryWellInput } from "./SummaryWellInput";

/**
 * The one formula editor open across the wells: a new formula, shown as a placeholder chip at the
 * end of its well, or an existing item whose chip it's anchored to.
 */
type FormulaSession =
  | { type: "new"; wellId: SummaryWellId; source: string; name: string }
  | { type: "edit"; itemId: string };

/** The item whose formula is edited, and the name it starts with. */
type FormulaEdit = {
  itemId: string;
  name: string;
};

type SummaryWellsProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
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
  const [session, setSession] = useState<FormulaSession | null>(null);
  // the open formula's name as it's typed, for its chip; `null` while it's empty
  const [draftName, setDraftName] = useState<string | null>(null);
  const dismissRef = useRef<(() => boolean) | null>(null);
  const formulaEdit =
    session?.type === "edit"
      ? getFormulaEdit(definition, session.itemId)
      : null;
  const openWellId =
    session?.type === "new"
      ? session.wellId
      : formulaEdit != null
        ? getItemWellId(definition, formulaEdit.itemId)
        : null;
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

  const closeFormula = () => {
    setSession(null);
    setDraftName(null);
  };

  // opening another formula first closes the open one the way an outside click would,
  // so an invalid draft stays open with its error instead of being replaced
  const openFormula = (next: FormulaSession) => {
    const isSameEdit =
      session?.type === "edit" &&
      next.type === "edit" &&
      session.itemId === next.itemId;
    if (isSameEdit || (session != null && dismissRef.current?.() === false)) {
      return;
    }
    setDraftName(null);
    setSession(next);
  };

  const handleRemove = (itemId: string) => {
    onChange(removeItem(definition, itemId));
    if (itemId === formulaEdit?.itemId) {
      closeFormula();
    }
  };

  const handleSubmitFormula = (expression: SummaryExpression) => {
    if (formulaEdit != null) {
      onChange(
        replaceWithExpression(definition, formulaEdit.itemId, expression),
      );
    } else if (session?.type === "new") {
      onChange(
        session.wellId === "values"
          ? addExpressionValue(definition, expression)
          : addExpressionDimension(definition, session.wellId, expression),
      );
    }
    closeFormula();
  };

  const formulaPanel: FormulaPanel | null =
    openWellId == null
      ? null
      : {
          editor: (
            <SummaryFormulaEditor
              key={formulaEdit?.itemId ?? "new"}
              base={base}
              database={database}
              expressionMode={
                openWellId === "values" ? "aggregation" : "expression"
              }
              initialClause={
                formulaEdit != null
                  ? getFormulaClause(base, definition, formulaEdit.itemId)
                  : undefined
              }
              initialSource={session?.type === "new" ? session.source : ""}
              initialName={
                session?.type === "new" ? session.name : formulaEdit?.name
              }
              // short enough to fit the panel's single line without truncating
              placeholder={
                openWellId === "values"
                  ? t`e.g. Sum([Total]) / Count()`
                  : t`e.g. month([Created At])`
              }
              submitLabel={formulaEdit != null ? t`Update` : t`Add`}
              dismissRef={dismissRef}
              onNameChange={setDraftName}
              onSubmit={handleSubmitFormula}
              onCancel={closeFormula}
            />
          ),
          onClickOutside: () => dismissRef.current?.(),
        };

  const getChipFormula = (itemId: string) =>
    itemId === formulaEdit?.itemId
      ? { panel: formulaPanel, label: draftName }
      : null;

  const renderField = (wellId: SummaryWellId, items: ReactNode[]) => (
    <SummaryWellInput
      base={base}
      database={database}
      wellId={wellId}
      definition={definition}
      isFormulaOpen={openWellId === wellId}
      onChange={onChange}
      onStartFormula={(source, name) =>
        openFormula({ type: "new", wellId, source, name })
      }
    >
      {items}
      {session?.type === "new" && session.wellId === wellId && (
        <PlaceholderChip formulaPanel={formulaPanel} onCancel={closeFormula} />
      )}
    </SummaryWellInput>
  );

  const renderDimensions = (
    wellId: SummaryWellId,
    dimensions: SummaryDimension[],
  ) =>
    dimensions.map((dimension) => {
      const chipFormula = getChipFormula(dimension.id);
      const label = chipFormula?.label || (itemLabels.get(dimension.id) ?? "");
      return (
        <WellChip
          key={dimension.id}
          wellId={wellId}
          itemId={dimension.id}
          label={label}
          formulaPanel={chipFormula?.panel}
          onRemove={handleRemove}
        >
          {"expression" in dimension && (
            <FormulaChipLabel
              label={label}
              onEdit={() => openFormula({ type: "edit", itemId: dimension.id })}
            />
          )}
        </WellChip>
      );
    });

  return (
    <Box className={S.wells} data-testid="summary-wells">
      <SummaryWell
        wellId="values"
        title={t`Values`}
        definition={definition}
        draggedItem={draggedItem}
      >
        {renderField(
          "values",
          definition.values.map((value) => {
            const chipFormula = getChipFormula(value.id);
            return (
              <ValueChip
                key={value.id}
                base={base}
                value={value}
                label={chipFormula?.label || (itemLabels.get(value.id) ?? "")}
                formulaPanel={chipFormula?.panel}
                onChangeOperator={(operatorShortName) =>
                  onChange(
                    changeValueOperator(
                      definition,
                      value.id,
                      operatorShortName,
                    ),
                  )
                }
                onEditFormula={
                  canWriteValueFormula
                    ? () => openFormula({ type: "edit", itemId: value.id })
                    : undefined
                }
                onRemove={handleRemove}
              />
            );
          }),
        )}
      </SummaryWell>
      <SummaryWell
        wellId="columns"
        title={isPivot ? t`Columns` : t`Breakouts`}
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
    </Box>
  );
}

/** The formula edit in progress, or `null` when nothing is edited or the edited item is gone. */
function getFormulaEdit(
  definition: SummaryDefinition,
  itemId: string,
): FormulaEdit | null {
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
    // the formula panel is portaled out of the card, but its events still bubble here through React
    if (
      !(event.target instanceof Element) ||
      !event.currentTarget.contains(event.target) ||
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
  /** The formula editor, while this chip's formula is edited. */
  formulaPanel?: FormulaPanel | null;
  children?: ReactNode;
  onRemove: (itemId: string) => void;
};

function WellChip({
  wellId,
  itemId,
  label,
  formulaPanel,
  children,
  onRemove,
}: WellChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `summary-chip:${itemId}`,
    data: { kind: "chip", wellId, itemId, label } satisfies SummaryDragItem,
  });

  return (
    <FormulaAnchor panel={formulaPanel}>
      <Box
        ref={setNodeRef}
        className={cx(S.chip, {
          [S.isDragging]: isDragging,
          [S.chipIsEditing]: formulaPanel != null,
        })}
        data-testid="summary-well-item"
        {...attributes}
        {...listeners}
      >
        {children || <span className={S.chipLabel}>{label}</span>}
        <ActionIcon
          className={S.chipRemove}
          size="sm"
          variant="transparent"
          c="inherit"
          aria-label={t`Remove ${label}`}
          onClick={() => onRemove(itemId)}
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      </Box>
    </FormulaAnchor>
  );
}

type PlaceholderChipProps = {
  formulaPanel: FormulaPanel | null;
  onCancel: () => void;
};

/**
 * Where a new formula will land in its well; it takes the formula's name once it's added. It has a
 * chip's ✕, which cancels the formula, so it's the size of the chip that replaces it.
 */
function PlaceholderChip({ formulaPanel, onCancel }: PlaceholderChipProps) {
  return (
    <FormulaAnchor panel={formulaPanel}>
      <Box
        className={cx(S.chip, S.chipPlaceholder)}
        data-testid="summary-formula-placeholder"
      >
        <Icon name="function" size={12} />
        <span className={S.chipLabel}>{t`New formula`}</span>
        <ActionIcon
          className={S.chipRemove}
          size="sm"
          variant="subtle"
          c="inherit"
          aria-label={t`Cancel the new formula`}
          onClick={onCancel}
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      </Box>
    </FormulaAnchor>
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
  /** The formula editor, while this chip's formula is edited. */
  formulaPanel: FormulaPanel | null | undefined;
  onChangeOperator: (operatorShortName: string) => void;
  /** Omitted when the database can't aggregate with a formula. */
  onEditFormula?: () => void;
  onRemove: (itemId: string) => void;
};

function ValueChip({
  base,
  value,
  label,
  formulaPanel,
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
        formulaPanel={formulaPanel}
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
      formulaPanel={formulaPanel}
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
