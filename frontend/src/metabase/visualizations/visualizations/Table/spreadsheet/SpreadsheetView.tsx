import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { compileExpression } from "metabase/querying/expressions/compile-expression";
import {
  ActionIcon,
  Button,
  Flex,
  Group,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { VisibleTableData } from "../../../lib/visible-table-data";
import type { VisualizationProps } from "../../../types";

import { FormulaBar, type FormulaBarHandle } from "./FormulaBar";
import { type GridCellAddress, SpreadsheetGrid } from "./SpreadsheetGrid";
import { translateAggregateFormula } from "./aggregation-translation";
import { indexToColumnLetter } from "./column-letters";
import { needsServerEvaluation } from "./formula-engine";
import type { FormulaFunctionSpec } from "./formula-functions";
import { rebaseFormula } from "./formula-rebase";
import { getMatchingFunctions } from "./formula-suggestions";
import { insertTextAtCursor } from "./insert-at-cursor";
import { translateFormulaSource } from "./mbql-translation";
import { getReferenceHighlights } from "./reference-highlights";
import { BLANK_COLUMN_BUFFER, DEFAULT_SPREADSHEET_VIEW_OPTIONS } from "./types";
import { useSpreadsheetFields } from "./use-spreadsheet-fields";

interface SpreadsheetViewProps {
  data: VisibleTableData;
  onExit: () => void;
  /** Flex-fill classes forwarded from Table.tsx — see the comment there.
   * Without these the root sizes to its own content instead of the real
   * available space, which also breaks internal scrolling (there's
   * nothing to scroll *within* if the container itself is already
   * oversized to fit everything). */
  className?: string;
  /** Needed to promote a translatable formula into a real, saveable MBQL
   * custom column on commit — see attemptPromotion below. Absent (or
   * onChangeCardAndRun absent) means formulas stay client-side-only, e.g.
   * outside the query builder. */
  question?: Question;
  onChangeCardAndRun?: VisualizationProps["onChangeCardAndRun"];
}

export function SpreadsheetView({
  data,
  onExit,
  className,
  question,
  onChangeCardAndRun,
}: SpreadsheetViewProps) {
  const {
    fields,
    getCell,
    addFormulaField,
    removeFormulaField,
    updateFormulaField,
  } = useSpreadsheetFields(data);

  // False outside the query builder (no question/onChangeCardAndRun to
  // save into) — hides Save actions entirely rather than showing buttons
  // that would always fail.
  const canSave = !!question && !!onChangeCardAndRun;

  const [options, setOptions] = useState(DEFAULT_SPREADSHEET_VIEW_OPTIONS);
  const [selectedCell, setSelectedCell] = useState<GridCellAddress | null>(
    null,
  );
  const [editingText, setEditingText] = useState<string | null>(null);
  // Which input should receive focus once editing starts: typing/Enter on
  // a selected cell edits it right there (Excel default); clicking into
  // the formula bar edits from there instead. Both are controlled by the
  // same editingText, so either one always mirrors the other.
  const [editFocusTarget, setEditFocusTarget] = useState<"cell" | "formulaBar">(
    "cell",
  );
  const isEditing = editingText != null;
  const formulaBarRef = useRef<FormulaBarHandle>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Cursor position within editingText, kept in sync from whichever input
  // (formula bar or in-cell) last changed — drives the function-name
  // suggestion dropdown below (see formula-suggestions.ts).
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  // Escape closes the dropdown without cancelling the whole edit; this is
  // what "closed" means, since the dropdown's contents are otherwise
  // purely derived from editingText + cursorPosition (nothing to toggle
  // off without an explicit flag — the same text/cursor would just
  // recompute the same matches).
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  // Caret position to apply once an accepted suggestion has rendered.
  const [pendingCursor, setPendingCursor] = useState<number | null>(null);

  // Cells the in-progress formula refers to, outlined in the grid while
  // you type — the same feedback Excel/Sheets give so you can see what
  // "=A1+B1" actually points at.
  const referenceHighlights = useMemo(
    () => (isEditing ? getReferenceHighlights(editingText ?? "") : []),
    [isEditing, editingText],
  );

  // Metabase's function library is per-database (a few clauses are gated
  // on engine features), so the suggestion list follows the question's.
  const database = question?.database() ?? null;

  const suggestionMatches = useMemo(
    () =>
      isEditing && !suggestionsDismissed
        ? getMatchingFunctions(editingText ?? "", cursorPosition, database)
        : [],
    [isEditing, suggestionsDismissed, editingText, cursorPosition, database],
  );

  // A <td> click doesn't give the DOM focus needed for keydown events to
  // reach handleGridKeyDown below, so move focus to the grid's container
  // explicitly whenever selection changes (but not while the formula bar
  // itself is focused/editing — that would steal focus away mid-edit).
  useEffect(() => {
    if (selectedCell && !isEditing) {
      gridContainerRef.current?.focus();
    }
  }, [selectedCell, isEditing]);

  // Move focus into the formula bar the moment editing starts. This has to
  // be a layout effect, not a plain callback with requestAnimationFrame:
  // the input is only non-readOnly once this render has committed, and a
  // bare rAF called from inside the triggering event handler can lose the
  // race against a fast next keystroke — which then falls through to
  // Metabase's own global keyboard shortcuts instead of the formula bar
  // (e.g. a stray "s" opening the Summarize panel instead of being typed).
  useLayoutEffect(() => {
    if (isEditing) {
      if (editFocusTarget === "cell") {
        cellInputRef.current?.focus();
      } else {
        formulaBarRef.current?.focus();
      }
    }
  }, [isEditing, editFocusTarget]);

  useLayoutEffect(() => {
    if (pendingCursor == null) {
      return;
    }
    if (editFocusTarget === "cell" && cellInputRef.current) {
      cellInputRef.current.focus();
      cellInputRef.current.setSelectionRange(pendingCursor, pendingCursor);
    } else {
      formulaBarRef.current?.focus(pendingCursor);
    }
    setPendingCursor(null);
  }, [pendingCursor, editFocusTarget]);

  const handleOptionsChange = useCallback(
    (updates: Partial<typeof options>) =>
      setOptions((prev) => ({ ...prev, ...updates })),
    [],
  );

  const selectedField = selectedCell
    ? (fields[selectedCell.col] ?? null)
    : null;
  const isBlankColumn =
    selectedCell != null &&
    selectedField == null &&
    !options.isTransposed &&
    selectedCell.col >= fields.length;
  // Read-only query-derived columns can still be *referenced* by formulas,
  // just not typed into directly.
  const isCellEditable = selectedField?.kind === "formula" || isBlankColumn;

  const selectedCellLabel = selectedCell
    ? `${indexToColumnLetter(selectedCell.col)}${selectedCell.row + 1}`
    : null;

  // What the formula bar shows when the selected cell ISN'T being edited:
  // the formula (prefixed with "=") for a formula field, the raw value for
  // a source column, or nothing for an empty column.
  //
  // The formula is rebased to the selected row, so selecting row 2 of a
  // column holding "=MAX(A1:A10)" shows "=MAX(A2:A11)" — the formula that
  // row actually computes. Editing seeds from this same text, which also
  // keeps a re-commit from a different row a no-op: committing re-anchors
  // to the cursor's row, so the text has to already be relative to it.
  const displayText = (() => {
    if (!selectedCell) {
      return "";
    }
    if (selectedField?.kind === "formula") {
      return `=${rebaseFormula(selectedField.formula, selectedField.anchorRow, selectedCell.row)}`;
    }
    if (selectedField?.kind === "source") {
      const cell = getCell(selectedCell.row, selectedCell.col);
      return cell.rawValue == null ? "" : String(cell.rawValue);
    }
    return "";
  })();

  const startEditing = useCallback(
    (seedText: string, focusTarget: "cell" | "formulaBar" = "cell") => {
      if (!isCellEditable) {
        return;
      }
      setEditFocusTarget(focusTarget);
      setEditingText(seedText);
      setCursorPosition(seedText.length);
      setSuggestionsDismissed(false);
      setSuggestionIndex(0);
      // Focus is handled by the useLayoutEffect above once this commits.
    },
    [isCellEditable],
  );

  // Both mirrored inputs (formula bar, in-cell) funnel every keystroke
  // through here — it's the single source of truth for what's being
  // typed and where the cursor is, which the suggestion dropdown reads.
  const handleChangeEditingText = useCallback(
    (value: string, cursor: number) => {
      setEditingText(value);
      setCursorPosition(cursor);
      setSuggestionsDismissed(false);
      setSuggestionIndex(0);
    },
    [],
  );

  // Replaces the in-progress function-name token with `fn.name(`, then
  // refocuses whichever input was active with the cursor right after the
  // new "(" — ready to keep typing arguments or point-and-click a cell.
  const applySuggestion = useCallback(
    (fn: FormulaFunctionSpec) => {
      if (editingText == null) {
        return;
      }
      let tokenStart = cursorPosition;
      while (tokenStart > 0 && /[A-Za-z]/.test(editingText[tokenStart - 1])) {
        tokenStart--;
      }
      const next =
        editingText.slice(0, tokenStart) +
        fn.name +
        "(" +
        editingText.slice(cursorPosition);
      const nextCursor = tokenStart + fn.name.length + 1;

      setEditingText(next);
      setCursorPosition(nextCursor);
      setSuggestionsDismissed(false);
      setSuggestionIndex(0);
      // Applied in a layout effect rather than a requestAnimationFrame:
      // rAF leaves a frame-long window where the caret is still at the
      // old spot, and a keystroke arriving in it lands in the wrong
      // place. The effect runs before the browser yields again.
      setPendingCursor(nextCursor);
    },
    [editingText, cursorPosition],
  );

  // Tries to turn a formula into a real, saveable MBQL custom column —
  // the same kind the query builder's own expression editor creates —
  // and add it to the question's query. Only formulas that read *other
  // columns in the same row* can be expressed this way; anything reaching
  // into a different row, or SUM/AVERAGE/COUNT/MIN/MAX, has no per-row
  // equivalent (see mbql-translation.ts) and stays client-side-only.
  //
  // This is a deliberate, separate action (see handleSaveAll below) —
  // NOT something commitEditing calls automatically. Adding the column
  // reruns the query via onChangeCardAndRun, which is Metabase's normal
  // "query changed" navigation; doing that on every Enter while typing
  // would kick you out of the spreadsheet view mid-edit, which is exactly
  // what Enter should never do (it should just accept the cell, like
  // Excel). Saving is something you ask for once you're done.
  const attemptPromotion = useCallback(
    (
      name: string,
      formula: string,
      anchorRow: number,
    ): { promoted: boolean; reason?: string } => {
      if (!question || !onChangeCardAndRun) {
        return { promoted: false, reason: "no question to save into" };
      }
      const translation = translateFormulaSource(formula, anchorRow, fields);
      if (!translation.ok) {
        return { promoted: false, reason: translation.reason };
      }
      try {
        const query = question.query();
        const stageIndex = -1;
        const availableColumns = Lib.expressionableColumns(query, stageIndex);
        const result = compileExpression({
          source: translation.expressionSource,
          expressionMode: "expression",
          query,
          stageIndex,
          availableColumns,
        });
        if (result.error) {
          return { promoted: false, reason: result.error.message };
        }
        const newQuery = Lib.expression(
          query,
          stageIndex,
          name,
          result.expressionClause,
        );
        const nextCard = question.setQuery(newQuery).card();
        onChangeCardAndRun({ nextCard });
        return { promoted: true };
      } catch (err) {
        // metabase-lib is not something a formula-editing flow should be
        // able to crash; fall back to keeping it client-side.
        return {
          promoted: false,
          reason: err instanceof Error ? err.message : "couldn't save",
        };
      }
    },
    [question, onChangeCardAndRun, fields],
  );

  /**
   * Range formulas such as SUM(D1:D200) can't become a column, because an
   * MBQL expression only ever sees one row. They can become an
   * aggregation, which is a different query shape: it collapses the
   * result to a summary instead of adding a column. That's too big a
   * change to do silently on commit, so it's offered as a button on the
   * column header and only happens when the user asks.
   */
  const summaryLabelByFieldId = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const field of fields) {
      if (field.kind !== "formula" || !field.saveError) {
        continue;
      }
      const summary = translateAggregateFormula(field.formula, fields);
      if (summary.ok) {
        labels[field.id] = summary.label;
      }
    }
    return labels;
  }, [fields]);

  /**
   * A range formula adds up the rows the browser actually has, which is
   * only ever the page of results that came back. The aggregation runs in
   * the database over every row the query matches, so on a limited or
   * truncated result the two numbers legitimately differ, often by a lot.
   * Rather than let that land as a surprise, the offer says so up front.
   */
  const isResultPartial = useMemo(() => {
    if (!question) {
      return false;
    }
    try {
      return Lib.hasLimit(question.query(), -1) || data.rows.length >= 2000;
    } catch {
      return false;
    }
  }, [question, data.rows.length]);

  const summarizeField = useCallback(
    (fieldId: string) => {
      const field = fields.find((f) => f.id === fieldId);
      if (field?.kind !== "formula" || !question || !onChangeCardAndRun) {
        return;
      }
      const summary = translateAggregateFormula(field.formula, fields);
      if (!summary.ok) {
        updateFormulaField(fieldId, { saveError: summary.reason });
        return;
      }
      try {
        const query = question.query();
        const stageIndex = -1;
        const result = compileExpression({
          source: summary.expressionSource,
          expressionMode: "aggregation",
          query,
          stageIndex,
          availableColumns: Lib.aggregableColumns(query, stageIndex),
        });
        if (result.error) {
          updateFormulaField(fieldId, { saveError: result.error.message });
          return;
        }
        const newQuery = Lib.aggregate(
          query,
          stageIndex,
          result.expressionClause,
        );
        onChangeCardAndRun({ nextCard: question.setQuery(newQuery).card() });
        // The summary replaces the result entirely, so the client-side
        // field that produced it has nothing left to describe.
        removeFormulaField(fieldId);
      } catch (err) {
        updateFormulaField(fieldId, {
          saveError: err instanceof Error ? err.message : "couldn't summarize",
        });
      }
    },
    [
      fields,
      question,
      onChangeCardAndRun,
      updateFormulaField,
      removeFormulaField,
    ],
  );

  const savableFields = fields.filter(
    (field) => field.kind === "formula" && !field.saveError,
  );

  // Saves every currently-savable formula field in one action — this is
  // the prominent, header-level Save button. Builds up ONE
  // combined query and calls onChangeCardAndRun exactly once: calling
  // attemptPromotion in a loop would have each iteration start from the
  // same stale `question` prop (it doesn't update synchronously between
  // calls), silently dropping every expression but the last one.
  const handleSaveAll = useCallback(() => {
    if (!question || !onChangeCardAndRun || savableFields.length === 0) {
      return;
    }
    let query = question.query();
    const stageIndex = -1;
    const promotedIds: string[] = [];
    const failures: { id: string; reason: string }[] = [];

    for (const field of savableFields) {
      if (field.kind !== "formula") {
        continue;
      }
      const translation = translateFormulaSource(
        field.formula,
        field.anchorRow,
        fields,
      );
      if (!translation.ok) {
        failures.push({
          id: field.id,
          reason: translation.reason,
        });
        continue;
      }
      try {
        const availableColumns = Lib.expressionableColumns(query, stageIndex);
        const result = compileExpression({
          source: translation.expressionSource,
          expressionMode: "expression",
          query,
          stageIndex,
          availableColumns,
        });
        if (result.error) {
          failures.push({ id: field.id, reason: result.error.message });
          continue;
        }
        query = Lib.expression(
          query,
          stageIndex,
          field.name,
          result.expressionClause,
        );
        promotedIds.push(field.id);
      } catch (err) {
        failures.push({
          id: field.id,
          reason: err instanceof Error ? err.message : "couldn't save",
        });
      }
    }

    if (promotedIds.length > 0) {
      const nextCard = question.setQuery(query).card();
      onChangeCardAndRun({ nextCard });
      promotedIds.forEach(removeFormulaField);
    }
    failures.forEach(({ id, reason }) =>
      updateFormulaField(id, { saveError: reason }),
    );
  }, [
    question,
    onChangeCardAndRun,
    savableFields,
    fields,
    removeFormulaField,
    updateFormulaField,
  ]);

  const commitEditing = useCallback(() => {
    if (editingText == null || !selectedCell) {
      setEditingText(null);
      return;
    }
    const formula = editingText.startsWith("=")
      ? editingText.slice(1)
      : editingText;

    if (formula.trim() === "") {
      // Nothing typed: treat as a no-op cancel rather than clearing an
      // existing field's formula out from under the user.
      setEditingText(null);
      return;
    }

    // Just accept the formula locally — see attemptPromotion's comment
    // for why this never auto-saves. translateFormulaSource is pure
    // (no metabase-lib calls), so this is only ever informational: it
    // tells the Fields panel/grid header whether a Save action would
    // currently succeed, without actually touching the query.
    const translation = translateFormulaSource(
      formula,
      selectedCell.row,
      fields,
    );
    const saveError = translation.ok ? undefined : translation.reason;

    // Formulas that use Metabase's function library, text, or a column
    // referenced by name have no local preview to offer: the browser
    // engine only does arithmetic. Rather than show "#SERVER!" and wait
    // for the user to press Save, promote them on the spot — the query
    // re-runs and the real values arrive a moment later. This is what
    // makes all ~64 expression functions usable here without
    // reimplementing any of them.
    if (needsServerEvaluation(formula)) {
      const landingCol = fields.length;
      const name =
        selectedField?.kind === "formula"
          ? selectedField.name
          : indexToColumnLetter(landingCol);
      const { promoted, reason } = attemptPromotion(
        name,
        formula,
        selectedCell.row,
      );
      if (promoted) {
        // It's a real query column now, so drop the client-side field —
        // otherwise the same column would appear twice.
        if (selectedField?.kind === "formula") {
          removeFormulaField(selectedField.id);
        }
        setEditingText(null);
        return;
      }
      // Couldn't be saved: keep it client-side with the reason attached,
      // so the header explains itself instead of failing silently.
      if (selectedField?.kind === "formula") {
        updateFormulaField(selectedField.id, {
          formula,
          anchorRow: selectedCell.row,
          saveError: reason,
        });
      } else if (isBlankColumn) {
        addFormulaField(
          indexToColumnLetter(landingCol),
          formula,
          selectedCell.row,
          reason,
        );
        setSelectedCell({ row: selectedCell.row, col: landingCol });
      }
      setEditingText(null);
      return;
    }

    if (selectedField?.kind === "formula") {
      updateFormulaField(selectedField.id, {
        formula,
        anchorRow: selectedCell.row,
        saveError,
      });
    } else if (isBlankColumn) {
      // New fields always get appended right after the last real field —
      // fields is a flat, gap-free array (see use-spreadsheet-fields.ts),
      // not a sparse one indexed by grid position. So a field typed into
      // the *second* blank column still lands at the *first* blank
      // slot's position. Naming and selecting by that true landing spot
      // (rather than by wherever was clicked) keeps the field's name
      // and on-grid position consistent — otherwise a field named "K"
      // could render under column J, and re-selecting "K1" would find a
      // different, still-blank cell instead of what you just typed.
      const landingCol = fields.length;
      addFormulaField(
        indexToColumnLetter(landingCol),
        formula,
        selectedCell.row,
        saveError,
      );
      setSelectedCell({ row: selectedCell.row, col: landingCol });
    }
    setEditingText(null);
  }, [
    editingText,
    selectedCell,
    fields,
    selectedField,
    isBlankColumn,
    updateFormulaField,
    addFormulaField,
    removeFormulaField,
    attemptPromotion,
  ]);

  const cancelEditing = useCallback(() => setEditingText(null), []);

  // Both mirrored inputs' onKeyDown delegate entirely to this — it owns
  // Enter/Escape (commit/cancel) same as before, plus, while the
  // function-name suggestion dropdown has matches, Up/Down to navigate it
  // and Tab/Enter to accept the highlighted one instead.
  const handleEditingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (suggestionMatches.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSuggestionIndex((i) => (i + 1) % suggestionMatches.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSuggestionIndex(
            (i) =>
              (i - 1 + suggestionMatches.length) % suggestionMatches.length,
          );
          return;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          event.preventDefault();
          applySuggestion(
            suggestionMatches[
              Math.min(suggestionIndex, suggestionMatches.length - 1)
            ],
          );
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSuggestionsDismissed(true);
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitEditing();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelEditing();
      }
    },
    [
      suggestionMatches,
      suggestionIndex,
      applySuggestion,
      commitEditing,
      cancelEditing,
    ],
  );

  const handleSelectCell = useCallback(
    (cell: GridCellAddress) => {
      if (isEditing) {
        // Point mode: clicking another cell while editing inserts a
        // reference to it instead of navigating away, exactly like
        // typing "=" then clicking a cell in Excel. Insert into whichever
        // of the two mirrored inputs (in-cell or formula bar) currently
        // has focus.
        const ref = `${indexToColumnLetter(cell.col)}${cell.row + 1}`;
        if (document.activeElement === cellInputRef.current) {
          insertTextAtCursor(
            cellInputRef.current,
            editingText ?? "",
            ref,
            setEditingText,
          );
        } else {
          formulaBarRef.current?.insertAtCursor(ref);
        }
        return;
      }
      setSelectedCell(cell);
    },
    [isEditing, editingText],
  );

  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Never hijack keys being typed into a real input inside the grid
      // (the in-cell editor, or a column-header rename box). Without
      // this, renaming a formula column while its own cell is selected
      // silently starts cell-editing instead and overwrites the formula,
      // because keydown bubbles up here from the rename input.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (isEditing || !selectedCell) {
        return;
      }

      const maxRow = data.rows.length - 1;
      const maxCol =
        (options.isTransposed
          ? fields.length
          : fields.length + BLANK_COLUMN_BUFFER) - 1;

      // Arrow keys (and Tab/Shift+Tab as next/previous column) navigate
      // regardless of whether the current cell is editable — browsing
      // read-only source columns should work like any other cell. In
      // transposed mode "down"/"up" move between fields (rendered as
      // rows there) instead of data rows, since the render axes swap.
      // Step along the render axes, then swap them when transposed: the
      // same keypress moves between fields rather than data rows there.
      const step = (() => {
        if (event.key === "ArrowUp") {
          return -1;
        }
        if (event.key === "ArrowDown") {
          return 1;
        }
        if (event.key === "ArrowLeft") {
          return -1;
        }
        if (
          event.key === "ArrowRight" ||
          (event.key === "Tab" && !event.shiftKey)
        ) {
          return 1;
        }
        if (event.key === "Tab" && event.shiftKey) {
          return -1;
        }
        return 0;
      })();
      const isVerticalKey =
        event.key === "ArrowUp" || event.key === "ArrowDown";
      const movesAlongFields = options.isTransposed === isVerticalKey;
      const deltaRow = step !== 0 && !movesAlongFields ? step : 0;
      const deltaCol = step !== 0 && movesAlongFields ? step : 0;

      if (deltaRow !== 0 || deltaCol !== 0) {
        event.preventDefault();
        setSelectedCell({
          row: Math.max(0, Math.min(selectedCell.row + deltaRow, maxRow)),
          col: Math.max(0, Math.min(selectedCell.col + deltaCol, maxCol)),
        });
        return;
      }

      if (!isCellEditable) {
        return;
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        startEditing(displayText);
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        // Typing directly on a selected cell overwrites it, like Excel —
        // don't seed with the old content.
        event.preventDefault();
        startEditing(event.key);
      }
    },
    [
      isEditing,
      selectedCell,
      isCellEditable,
      startEditing,
      displayText,
      data.rows.length,
      fields.length,
      options.isTransposed,
    ],
  );

  const handleRenameField = useCallback(
    (id: string, name: string) => {
      if (name.trim() !== "") {
        updateFormulaField(id, { name: name.trim() });
      }
    },
    [updateFormulaField],
  );

  return (
    <Flex
      direction="column"
      className={className}
      style={{ minHeight: 0 }}
      data-testid="spreadsheet-view"
    >
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Group gap="xs">
          <Icon name="function" c="brand" />
          <Text fw={700}>{t`Spreadsheet (preview)`}</Text>
        </Group>
        <Group gap="xs">
          {canSave && savableFields.length > 0 && (
            <Tooltip
              label={t`Save ${savableFields.length} formula column(s) as real, permanent columns on this question`}
            >
              <Button
                size="xs"
                variant="filled"
                leftSection={<Icon name="cloud" size={12} />}
                onClick={handleSaveAll}
                data-testid="spreadsheet-save-button"
              >
                {t`Save (${savableFields.length})`}
              </Button>
            </Tooltip>
          )}
          {/* The two view options worth keeping from the old side panel,
              as compact toggles rather than a whole panel. */}
          <Tooltip label={t`Column totals`}>
            <ActionIcon
              variant={options.showColumnTotals ? "filled" : "subtle"}
              onClick={() =>
                handleOptionsChange({
                  showColumnTotals: !options.showColumnTotals,
                })
              }
              aria-label={t`Column totals`}
            >
              <Icon name="sum" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t`Swap rows and columns`}>
            <ActionIcon
              variant={options.isTransposed ? "filled" : "subtle"}
              onClick={() =>
                handleOptionsChange({ isTransposed: !options.isTransposed })
              }
              aria-label={t`Swap rows and columns`}
            >
              <Icon name="pivot_table" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t`Back to normal table`}>
            <ActionIcon variant="subtle" onClick={onExit} aria-label={t`Exit`}>
              <Icon name="table2" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <FormulaBar
        ref={formulaBarRef}
        cellLabel={selectedCellLabel}
        isEditable={isCellEditable}
        isEditing={isEditing}
        value={isEditing ? (editingText ?? "") : displayText}
        onChangeValue={handleChangeEditingText}
        onStartEditing={() => startEditing(displayText, "formulaBar")}
        onKeyDown={handleEditingKeyDown}
        onCommit={commitEditing}
      />

      <Flex
        ref={gridContainerRef}
        flex={1}
        style={{ minHeight: 0, outline: "none" }}
        onKeyDown={handleGridKeyDown}
        tabIndex={-1}
      >
        <SpreadsheetGrid
          fields={fields}
          rowCount={data.rows.length}
          getCell={getCell}
          options={options}
          selectedCell={selectedCell}
          onSelectCell={handleSelectCell}
          isEditing={isEditing}
          editingValue={editingText ?? ""}
          onChangeEditingValue={handleChangeEditingText}
          onEditKeyDown={handleEditingKeyDown}
          onCommitEditing={commitEditing}
          editInputRef={cellInputRef}
          onRenameField={handleRenameField}
          onRemoveField={removeFormulaField}
          summaryLabelByFieldId={summaryLabelByFieldId}
          onSummarizeField={summarizeField}
          isResultPartial={isResultPartial}
          referenceHighlights={referenceHighlights}
          suggestions={suggestionMatches}
          suggestionIndex={suggestionIndex}
          onHoverSuggestion={setSuggestionIndex}
          onPickSuggestion={applySuggestion}
        />
      </Flex>
    </Flex>
  );
}
