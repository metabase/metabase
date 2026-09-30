import type { DatasetColumn } from "metabase-types/api";

export interface SpreadsheetSourceField {
  kind: "source";
  id: string;
  name: string;
  column: DatasetColumn;
  /** Index into the underlying VisibleTableData rows/cols. */
  sourceColumnIndex: number;
  isNumeric: boolean;
}

export interface SpreadsheetFormulaField {
  kind: "formula";
  id: string;
  name: string;
  /** Raw formula text, without the leading "=". */
  formula: string;
  /**
   * 0-based row index this formula was typed into. Relative cell
   * references in `formula` are stored as literal row indices, so this is
   * what makes filling down work correctly regardless of which row you
   * started editing in (see formula-engine.ts).
   */
  anchorRow: number;
  /**
   * Set when this formula couldn't be saved as a real query column —
   * either it isn't translatable (cross-row reference, range/aggregate
   * function) or metabase-lib rejected the translated expression. A
   * translatable formula is promoted to a real custom column immediately
   * on commit and removed from this list entirely, so any field that
   * still exists here with no saveError simply hasn't been attempted yet
   * (e.g. no question/onChangeCardAndRun available in this context).
   */
  saveError?: string;
}

export type SpreadsheetField = SpreadsheetSourceField | SpreadsheetFormulaField;

export type ColumnWidthMode = "auto" | "fixed";
export type TextAlign = "left" | "right";

export interface SpreadsheetViewOptions {
  isOptionsPanelOpen: boolean;
  columnWidthMode: ColumnWidthMode;
  headerTextAlign: TextAlign;
  cellTextAlign: TextAlign;
  showColumnLetters: boolean;
  showColumnTotals: boolean;
  isTransposed: boolean;
}

/**
 * Number of empty trailing columns always shown after the real fields, so
 * there's somewhere to click and start typing a new formula — like Excel's
 * effectively-infinite grid, but bounded. Since this is computed relative
 * to the current field count (see SpreadsheetGrid), the buffer "follows"
 * the last real column automatically as fields are added.
 */
export const BLANK_COLUMN_BUFFER = 6;

export const DEFAULT_SPREADSHEET_VIEW_OPTIONS: SpreadsheetViewOptions = {
  isOptionsPanelOpen: false,
  // Fixed-width columns by default, like a spreadsheet's uniform grid —
  // content-sized columns made blank/new columns uselessly narrow.
  columnWidthMode: "fixed",
  headerTextAlign: "left",
  cellTextAlign: "left",
  showColumnLetters: true,
  showColumnTotals: false,
  isTransposed: false,
};
