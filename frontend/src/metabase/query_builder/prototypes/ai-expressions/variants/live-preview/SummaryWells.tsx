import { useDraggable, useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { type MouseEvent, type ReactNode, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

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

import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import S from "./SummarySidebar.module.css";
import { SummaryWellInput } from "./SummaryWellInput";

/**
 * The formula being written, new or edited. Every draft that compiles is applied to the summary
 * right away, so the results follow along; cancelling puts back `original`.
 */
type FormulaSession = {
  /** The editor's identity, kept when a new formula's first draft joins the well as a chip. */
  key: string;
  wellId: SummaryWellId;
  /** The edited item, or a new formula's draft; `null` until a new formula first compiles. */
  itemId: string | null;
  isNew: boolean;
  /** The summary from before the edit. */
  original: SummaryDefinition;
  /** The summary as the last draft left it; `null` while no draft has been applied. */
  applied: SummaryDefinition | null;
  initialClause: Lib.Expressionable | null;
  initialSource: string;
  initialName: string;
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
  const [formulaSession, setFormulaSession] = useState<FormulaSession | null>(
    null,
  );
  // an edit ends once its item leaves the summary
  const session =
    formulaSession?.itemId == null ||
    findDimension(definition, formulaSession.itemId) != null ||
    definition.values.some(({ id }) => id === formulaSession.itemId)
      ? formulaSession
      : null;
  const editedItemId = session?.itemId;
  const isPreviewing = session?.applied != null;
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

  const handleRemove = (itemId: string) => {
    onChange(removeItem(definition, itemId));
    if (itemId === session?.itemId) {
      setFormulaSession(null);
    }
  };

  // opening another formula keeps whatever the open one shows in the results, like clicking away in a sheet
  const handleEditFormula = (itemId: string) => {
    // it's already open, maybe with a draft showing that reopening would make the new starting point
    if (itemId === editedItemId) {
      return;
    }
    setFormulaSession({
      key: itemId,
      wellId: getItemWellId(definition, itemId),
      itemId,
      isNew: false,
      original: definition,
      applied: null,
      initialClause: getFormulaClause(base, definition, itemId),
      initialSource: "",
      initialName: getFormulaName(definition, itemId),
    });
  };

  const handleStartFormula = (
    wellId: SummaryWellId,
    source: string,
    name = "",
  ) => {
    setFormulaSession({
      key: _.uniqueId("summary-formula-"),
      wellId,
      itemId: null,
      isNew: true,
      original: definition,
      applied: null,
      initialClause: null,
      initialSource: source,
      initialName: name,
    });
  };

  const handlePreview = (expression: SummaryExpression) => {
    if (session == null) {
      return;
    }
    const { wellId, itemId } = session;
    if (itemId != null) {
      const nextDefinition = replaceWithExpression(
        definition,
        itemId,
        expression,
      );
      setFormulaSession({ ...session, applied: nextDefinition });
      onChange(nextDefinition);
      return;
    }
    // a new formula's first draft joins the well; later drafts replace it in place
    const nextDefinition =
      wellId === "values"
        ? addExpressionValue(definition, expression)
        : addExpressionDimension(definition, wellId, expression);
    const draftItem = (
      wellId === "values" ? nextDefinition.values : nextDefinition[wellId]
    ).at(-1);
    setFormulaSession({
      ...session,
      itemId: draftItem?.id ?? null,
      applied: nextDefinition,
    });
    onChange(nextDefinition);
  };

  const handleCancelFormula = () => {
    if (session?.applied != null && session.itemId != null) {
      // untouched since the last draft: back to exactly the summary from before the edit.
      // Otherwise only the edited item goes back, keeping what else changed in the meantime
      onChange(
        definition === session.applied
          ? session.original
          : restoreItem(definition, session.original, session.itemId),
      );
    }
    setFormulaSession(null);
  };

  const formulaEditor =
    session != null ? (
      <SummaryFormulaEditor
        key={session.key}
        base={base}
        database={database}
        expressionMode={
          session.wellId === "values" ? "aggregation" : "expression"
        }
        initialClause={session.initialClause}
        initialSource={session.initialSource}
        initialName={session.initialName}
        hasPreview={session.itemId != null}
        placeholder={
          session.wellId === "values"
            ? t`Aggregate with a formula, or type / to search`
            : t`Group by a formula, or type / to search`
        }
        submitLabel={session.isNew ? t`Add` : t`Update`}
        onPreview={handlePreview}
        onSubmit={() => setFormulaSession(null)}
        onCancel={handleCancelFormula}
      />
    ) : null;

  const renderField = (wellId: SummaryWellId, items: ReactNode[]) => (
    <SummaryWellInput
      base={base}
      database={database}
      wellId={wellId}
      definition={definition}
      formulaEditor={session?.wellId === wellId ? formulaEditor : null}
      onChange={onChange}
      onStartFormula={(source, name) =>
        handleStartFormula(wellId, source, name)
      }
    >
      {items}
    </SummaryWellInput>
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
          isEditing={dimension.id === editedItemId}
          isPreview={isPreviewing && dimension.id === editedItemId}
          onRemove={handleRemove}
        >
          {"expression" in dimension && (
            <FormulaChipLabel
              label={label}
              onEdit={() => handleEditFormula(dimension.id)}
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
          definition.values.map((value) => (
            <ValueChip
              key={value.id}
              base={base}
              value={value}
              label={itemLabels.get(value.id) ?? ""}
              isEditing={value.id === editedItemId}
              isPreview={isPreviewing && value.id === editedItemId}
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
            />
          )),
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

/** The name an edited formula starts with: a formula item's own, or none for a count or column value. */
function getFormulaName(definition: SummaryDefinition, itemId: string): string {
  const dimension = findDimension(definition, itemId);
  if (dimension != null) {
    return "expression" in dimension ? dimension.expression.name : "";
  }
  const value = definition.values.find(({ id }) => id === itemId);
  return value?.type === "expression" ? value.expression.name : "";
}

/** `definition` with `itemId` as it was in `original`, or without it if `original` didn't have it. */
function restoreItem(
  definition: SummaryDefinition,
  original: SummaryDefinition,
  itemId: string,
): SummaryDefinition {
  const originalDimension = findDimension(original, itemId);
  const originalValue = original.values.find(({ id }) => id === itemId);
  if (originalDimension == null && originalValue == null) {
    return removeItem(definition, itemId);
  }
  const restoreDimension = (dimension: SummaryDimension) =>
    dimension.id === itemId && originalDimension != null
      ? originalDimension
      : dimension;
  return {
    rows: definition.rows.map(restoreDimension),
    columns: definition.columns.map(restoreDimension),
    values: definition.values.map((value) =>
      value.id === itemId && originalValue != null ? originalValue : value,
    ),
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
// the formula editor's content comes before its name input, so it wins while a formula is open
const FIELD_SELECTOR = "[contenteditable='true'], input";

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
  isEditing?: boolean;
  /** The results show the formula being written, which isn't kept until it's committed. */
  isPreview?: boolean;
  children?: ReactNode;
  onRemove: (itemId: string) => void;
};

function WellChip({
  wellId,
  itemId,
  label,
  isEditing = false,
  isPreview = false,
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
        [S.chipIsEditing]: isEditing && !isPreview,
        [S.chipIsPreview]: isPreview,
      })}
      data-testid="summary-well-item"
      {...attributes}
      {...listeners}
    >
      {children || <span className={S.chipLabel}>{label}</span>}
      {isPreview && (
        <Tooltip
          label={t`Shown in the results. Enter keeps it, Esc undoes it.`}
        >
          <span className={S.chipPreviewBadge}>{t`Preview`}</span>
        </Tooltip>
      )}
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
  isPreview: boolean;
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
  isPreview,
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
        isPreview={isPreview}
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
