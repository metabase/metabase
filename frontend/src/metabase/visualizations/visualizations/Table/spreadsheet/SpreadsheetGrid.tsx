import cx from "classnames";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Icon, Paper, Stack, Text, Tooltip } from "metabase/ui";

import { EDIT_INPUT_MARKER } from "./FormulaBar";
import S from "./SpreadsheetGrid.module.css";
import { indexToColumnLetter } from "./column-letters";
import type { FormulaFunctionSpec } from "./formula-functions";
import {
  type ReferenceHighlight,
  getHighlightColorIndex,
} from "./reference-highlights";
import type { SpreadsheetField, SpreadsheetViewOptions } from "./types";
import { BLANK_COLUMN_BUFFER } from "./types";
import type { SpreadsheetCell } from "./use-spreadsheet-fields";

/** Must match .cell's height in SpreadsheetGrid.module.css — the row
 * window below is computed from it rather than measured. */
const ROW_HEIGHT = 25;
const OVERSCAN_ROWS = 8;

export interface GridCellAddress {
  row: number;
  col: number;
}

interface SpreadsheetGridProps {
  fields: SpreadsheetField[];
  rowCount: number;
  getCell: (rowIndex: number, colIndex: number) => SpreadsheetCell;
  options: SpreadsheetViewOptions;
  selectedCell: GridCellAddress | null;
  onSelectCell: (cell: GridCellAddress) => void;
  /** When true, the selected cell renders an editable input in place of
   * its static value — typing on a selected cell edits it right there,
   * mirroring the formula bar above (both are controlled by the same
   * value, like Excel/Sheets). */
  isEditing: boolean;
  editingValue: string;
  onChangeEditingValue: (value: string, cursorPosition: number) => void;
  /** Enter/Escape (and, while a function-name suggestion dropdown is
   * open, Up/Down/Tab too) are handled by the parent, same as the
   * formula bar's — it owns the shared editing state both write to. */
  onEditKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCommitEditing: () => void;
  editInputRef: RefObject<HTMLInputElement>;
  /** Double-clicking a formula field's header renames it — source columns
   * (real query fields) aren't renamable here, that's a different,
   * already-existing Metabase mechanism (column display-name settings). */
  onRenameField: (id: string, name: string) => void;
  /** Deleting a formula column. Lives on the header now that there's no
   * side panel; source columns can't be deleted from here. */
  onRemoveField: (id: string) => void;
  /** Formula fields that can't be saved as a column but could become a
   * Metabase summary, keyed by field id, with the label to offer. */
  summaryLabelByFieldId: Record<string, string>;
  onSummarizeField: (id: string) => void;
  /** True when the grid only holds part of the result, which makes a
   * range formula's total differ from the database's. */
  isResultPartial: boolean;
  /** Function-name suggestions for the cell currently being edited. They
   * render anchored under that cell (like Sheets) rather than up by the
   * formula bar, so the list stays next to what you're typing. */
  /** Cells the formula being typed refers to, outlined per Excel/Sheets. */
  referenceHighlights: ReferenceHighlight[];
  suggestions: FormulaFunctionSpec[];
  suggestionIndex: number;
  onHoverSuggestion: (index: number) => void;
  onPickSuggestion: (fn: FormulaFunctionSpec) => void;
}

/** Spreadsheets show short codes (#VALUE!, #NAME?), not parser internals.
 * The engine already emits those for evaluation failures; parse failures
 * arrive as prose like `Expected "cellRef" but found ")"`, which is
 * useful on hover but far too noisy repeated down every row. */
function formatCellError(error: string): string {
  return error.startsWith("#") ? error.split(" ")[0] : "#ERROR!";
}

function formatCellValue(cell: SpreadsheetCell): string {
  if (cell.error) {
    return formatCellError(cell.error);
  }
  const value = cell.rawValue;
  if (value == null) {
    return "";
  }
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

interface FieldHeaderLabelProps {
  field: SpreadsheetField;
  isRenaming: boolean;
  renameDraft: string;
  onChangeRenameDraft: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRemove: () => void;
  /** Present when this field's formula can become a Metabase summary,
   * e.g. "Sum of Subtotal". Offered instead of leaving the user stuck on
   * "can't be saved". */
  summaryLabel?: string;
  onSummarize?: () => void;
  isResultPartial?: boolean;
}

function FieldHeaderLabel({
  field,
  isRenaming,
  renameDraft,
  onChangeRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRemove,
  summaryLabel,
  onSummarize,
  isResultPartial,
}: FieldHeaderLabelProps) {
  if (isRenaming) {
    return (
      <input
        className={S.renameInput}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        value={renameDraft}
        onChange={(event) => onChangeRenameDraft(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancelRename();
          }
        }}
        onBlur={onCommitRename}
      />
    );
  }
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      onDoubleClick={
        field.kind === "formula"
          ? (event) => {
              event.stopPropagation();
              onStartRename();
            }
          : undefined
      }
      title={field.kind === "formula" ? t`Double-click to rename` : undefined}
    >
      <FieldIcon field={field} />
      {field.name}
      {summaryLabel && onSummarize && (
        <button
          type="button"
          className={cx(S.removeFieldButton, S.summarizeFieldButton)}
          aria-label={t`Summarize as ${summaryLabel}`}
          title={
            isResultPartial
              ? t`Summarize as ${summaryLabel}. This runs in the database over every matching row, so it won't match the total above, which only covers the rows loaded here.`
              : t`Summarize as ${summaryLabel}`
          }
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSummarize();
          }}
        >
          <Icon name="sum" size={10} />
        </button>
      )}
      {field.kind === "formula" && (
        <button
          type="button"
          className={S.removeFieldButton}
          aria-label={t`Remove ${field.name}`}
          title={t`Remove column`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  );
}

function FieldIcon({ field }: { field: SpreadsheetField }) {
  if (field.kind === "formula") {
    if (field.saveError) {
      return (
        <Tooltip
          label={t`Can't be saved: ${field.saveError}`}
          multiline
          w={240}
        >
          <Icon name="warning_round" size={12} c="warning" />
        </Tooltip>
      );
    }
    return <Icon name="function" size={12} c="brand" />;
  }
  return field.isNumeric ? (
    <Icon name="sum" size={12} c="text-secondary" />
  ) : null;
}

export function SpreadsheetGrid({
  fields,
  rowCount,
  getCell,
  options,
  selectedCell,
  onSelectCell,
  isEditing,
  editingValue,
  onChangeEditingValue,
  onEditKeyDown,
  onCommitEditing,
  editInputRef,
  onRenameField,
  onRemoveField,
  summaryLabelByFieldId,
  onSummarizeField,
  isResultPartial,
  referenceHighlights,
  suggestions,
  suggestionIndex,
  onHoverSuggestion,
  onPickSuggestion,
}: SpreadsheetGridProps) {
  const { isTransposed, columnWidthMode, showColumnLetters, showColumnTotals } =
    options;
  const hasLetterRow = !isTransposed && showColumnLetters;

  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Only the rows on screen are rendered. Without this every keystroke
  // re-renders the whole grid: at 2000 rows that's 30k cells and ~250ms
  // of lag per character. Row height is fixed (see .cell in the CSS), so
  // the window is simple arithmetic rather than per-row measurement.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [scrollRow, setScrollRow] = useState(0);
  const [viewportRows, setViewportRows] = useState(40);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const measure = () =>
      setViewportRows(Math.ceil(wrapper.clientHeight / ROW_HEIGHT));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // Arrow-keying past the rendered window used to walk into rows that
  // aren't in the DOM at all, so the selection vanished. Scrolling the
  // wrapper is enough — the scroll handler re-derives the window.
  const selectedPrimary = selectedCell
    ? isTransposed
      ? selectedCell.col
      : selectedCell.row
    : null;
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper == null || selectedPrimary == null) {
      return;
    }
    const headerHeight = headRef.current?.offsetHeight ?? 0;
    const cellTop = headerHeight + selectedPrimary * ROW_HEIGHT;
    if (cellTop < wrapper.scrollTop + headerHeight) {
      wrapper.scrollTop = cellTop - headerHeight;
    } else if (
      cellTop + ROW_HEIGHT >
      wrapper.scrollTop + wrapper.clientHeight
    ) {
      wrapper.scrollTop = cellTop + ROW_HEIGHT - wrapper.clientHeight;
    }
  }, [selectedPrimary, isTransposed]);

  const commitRename = () => {
    if (renamingFieldId) {
      onRenameField(renamingFieldId, renameDraft);
    }
    setRenamingFieldId(null);
  };

  // Empty trailing columns to click into and start typing, like Excel's
  // effectively-infinite grid. Not offered in transposed mode — an empty
  // "row" there would represent a whole extra source-data row, which
  // isn't a thing this prototype can create.
  const blankColumnCount = isTransposed ? 0 : BLANK_COLUMN_BUFFER;

  // Canonical coordinates are always (dataRowIndex, fieldColumnIndex);
  // transposing only changes how we lay them out, not what a cell "is".
  const primaryCount = isTransposed ? fields.length : rowCount;
  const secondaryCount = isTransposed
    ? rowCount
    : fields.length + blankColumnCount;

  const toCanonical = (renderRow: number, renderCol: number): GridCellAddress =>
    isTransposed
      ? { row: renderCol, col: renderRow }
      : { row: renderRow, col: renderCol };

  const columnTotals = useMemo(() => {
    if (!showColumnTotals || isTransposed) {
      return null;
    }
    return fields.map((field, colIndex) => {
      const isSummable = field.kind === "formula" || field.isNumeric;
      if (!isSummable) {
        return null;
      }
      let sum = 0;
      for (let row = 0; row < rowCount; row++) {
        sum += getCell(row, colIndex).value ?? 0;
      }
      return sum;
    });
  }, [showColumnTotals, isTransposed, fields, rowCount, getCell]);

  const firstRow = Math.max(0, scrollRow - OVERSCAN_ROWS);
  const lastRow = Math.min(
    primaryCount,
    scrollRow + viewportRows + OVERSCAN_ROWS,
  );

  return (
    <div
      ref={wrapperRef}
      className={S.tableWrapper}
      data-testid="spreadsheet-grid"
      onScroll={(event) => {
        // The sticky header still occupies flow space, so scrollTop is
        // measured past it — subtract it or the window sits a couple of
        // rows below what's actually on screen. Snapped to whole rows so
        // state only changes when the rendered window would.
        const headerHeight = headRef.current?.offsetHeight ?? 0;
        const nextRow = Math.max(
          0,
          Math.floor(
            (event.currentTarget.scrollTop - headerHeight) / ROW_HEIGHT,
          ),
        );
        setScrollRow((prev) => (prev === nextRow ? prev : nextRow));
      }}
    >
      <table
        className={cx(S.table, {
          [S.autoWidth]: columnWidthMode === "auto",
          [S.fixedWidth]: columnWidthMode === "fixed",
        })}
      >
        <thead ref={headRef}>
          {hasLetterRow && (
            <tr className={S.letterHeaderRow}>
              <th className={S.gutterCell} />
              {Array.from({ length: secondaryCount }, (_, i) => (
                <th key={i}>{indexToColumnLetter(i)}</th>
              ))}
            </tr>
          )}
          <tr
            className={cx(S.fieldHeaderRow, { [S.noLetterRow]: !hasLetterRow })}
          >
            <th className={S.gutterCell} />
            {Array.from({ length: secondaryCount }, (_, i) => {
              const field = isTransposed ? undefined : fields[i];
              return (
                <th key={i} style={{ textAlign: options.headerTextAlign }}>
                  {isTransposed ? (
                    i + 1
                  ) : field ? (
                    <FieldHeaderLabel
                      field={field}
                      isRenaming={renamingFieldId === field.id}
                      renameDraft={renameDraft}
                      onChangeRenameDraft={setRenameDraft}
                      onStartRename={() => {
                        setRenamingFieldId(field.id);
                        setRenameDraft(field.name);
                      }}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenamingFieldId(null)}
                      onRemove={() => onRemoveField(field.id)}
                      summaryLabel={summaryLabelByFieldId[field.id]}
                      onSummarize={() => onSummarizeField(field.id)}
                      isResultPartial={isResultPartial}
                    />
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {firstRow > 0 && (
            <tr style={{ height: firstRow * ROW_HEIGHT }} aria-hidden />
          )}
          {Array.from({ length: lastRow - firstRow }, (_, offset) => {
            const renderRow = firstRow + offset;
            return (
              <tr key={renderRow}>
                <th className={S.gutterCell}>
                  {isTransposed && fields[renderRow] ? (
                    <FieldHeaderLabel
                      field={fields[renderRow]}
                      isRenaming={renamingFieldId === fields[renderRow].id}
                      renameDraft={renameDraft}
                      onChangeRenameDraft={setRenameDraft}
                      onStartRename={() => {
                        setRenamingFieldId(fields[renderRow].id);
                        setRenameDraft(fields[renderRow].name);
                      }}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenamingFieldId(null)}
                      onRemove={() => onRemoveField(fields[renderRow].id)}
                      summaryLabel={summaryLabelByFieldId[fields[renderRow].id]}
                      onSummarize={() => onSummarizeField(fields[renderRow].id)}
                      isResultPartial={isResultPartial}
                    />
                  ) : isTransposed ? null : (
                    renderRow + 1
                  )}
                </th>
                {Array.from({ length: secondaryCount }, (_, renderCol) => {
                  const { row, col } = toCanonical(renderRow, renderCol);
                  const cell = getCell(row, col);
                  const isSelected =
                    selectedCell?.row === row && selectedCell?.col === col;
                  const isBlankColumn = !isTransposed && col >= fields.length;
                  const isEditingThisCell = isSelected && isEditing;
                  const highlightColor = getHighlightColorIndex(
                    referenceHighlights,
                    row,
                    col,
                  );
                  return (
                    <td
                      key={renderCol}
                      className={cx(S.cell, {
                        [S.selected]: isSelected,
                        [S.errored]: !!cell.error,
                        [S.blankColumn]: isBlankColumn,
                        [S.editingCell]: isEditingThisCell,
                        [S.referenced]: highlightColor != null,
                        [S[`ref${highlightColor}`]]: highlightColor != null,
                      })}
                      style={{ textAlign: options.cellTextAlign }}
                      // Prevent the click from stealing focus away from the
                      // formula bar's input — if it's mid-edit, that focus
                      // change is what turns this click into a reference
                      // insertion instead of just losing the edit. (The
                      // input below stops this from also blocking normal
                      // cursor placement while editing *this* cell.)
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectCell({ row, col })}
                      // Full message on hover, since the cell only shows a
                      // short code (see formatCellError).
                      title={cell.error ?? undefined}
                      data-testid={`spreadsheet-cell-${indexToColumnLetter(col)}${row + 1}`}
                    >
                      {isEditingThisCell ? (
                        <input
                          ref={editInputRef}
                          className={S.cellInput}
                          style={{ textAlign: options.cellTextAlign }}
                          {...{ [EDIT_INPUT_MARKER]: "true" }}
                          value={editingValue}
                          onChange={(event) =>
                            onChangeEditingValue(
                              event.currentTarget.value,
                              event.currentTarget.selectionStart ??
                                event.currentTarget.value.length,
                            )
                          }
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={onEditKeyDown}
                          onBlur={(event) => {
                            const next = event.relatedTarget;
                            if (
                              !(next instanceof HTMLElement) ||
                              !next.hasAttribute(EDIT_INPUT_MARKER)
                            ) {
                              onCommitEditing();
                            }
                          }}
                        />
                      ) : null}
                      {isEditingThisCell && suggestions.length > 0 && (
                        <Paper
                          withBorder
                          shadow="sm"
                          radius="sm"
                          className={cx(S.suggestionList, {
                            // Near the right edge the list would run off
                            // screen, so hang it from the cell's right edge
                            // instead — same flip Sheets does.
                            [S.suggestionListRight]:
                              renderCol > secondaryCount - 3,
                          })}
                          data-testid="formula-suggestions"
                        >
                          <Stack gap={0} py={4}>
                            {suggestions.map((fn, i) => (
                              <Box
                                key={fn.name}
                                px="sm"
                                py={4}
                                role="option"
                                aria-selected={i === suggestionIndex}
                                bg={
                                  i === suggestionIndex
                                    ? "background-hover"
                                    : undefined
                                }
                                style={{ cursor: "pointer" }}
                                // onMouseMove, not onMouseEnter: the list
                                // often appears directly under a stationary
                                // cursor, and mouseenter would silently move
                                // the highlight off the first match before
                                // the user has touched anything.
                                onMouseMove={() => onHoverSuggestion(i)}
                                // Keep focus in the cell input; a real click
                                // would blur it and lose the in-progress edit.
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onPickSuggestion(fn)}
                              >
                                <Text
                                  size="sm"
                                  fw={600}
                                  ff="monospace"
                                  lh={1.3}
                                >
                                  {fn.signature}
                                </Text>
                                {i === suggestionIndex && (
                                  <Text size="xs" c="text-secondary" lh={1.3}>
                                    {fn.description}
                                  </Text>
                                )}
                              </Box>
                            ))}
                          </Stack>
                        </Paper>
                      )}
                      {!isEditingThisCell && formatCellValue(cell)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {lastRow < primaryCount && (
            <tr
              style={{ height: (primaryCount - lastRow) * ROW_HEIGHT }}
              aria-hidden
            />
          )}
        </tbody>
        {columnTotals && (
          <tfoot>
            <tr className={S.totalsRow}>
              <th className={S.gutterCell}>Σ</th>
              {Array.from({ length: secondaryCount }, (_, i) => {
                const total = columnTotals[i];
                return (
                  <td key={i} style={{ textAlign: options.cellTextAlign }}>
                    {total == null
                      ? ""
                      : total.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
