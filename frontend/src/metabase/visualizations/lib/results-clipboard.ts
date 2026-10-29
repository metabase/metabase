import type { ContentTranslationFunction } from "metabase/content-translation/types";
import {
  formatCellValueForCopy,
  serializeTsv,
} from "metabase/data-grid/utils/formatting";
import * as DataGrid from "metabase/visualizations/lib/data_grid";
import { createPlainCellFormatter } from "metabase/visualizations/lib/plain-cell-formatter";
import { getVisibleTableData } from "metabase/visualizations/lib/visible-table-data";
import { getTitleForColumn as getPivotTitleForColumn } from "metabase/visualizations/visualizations/PivotTable/settings";
import type { HeaderItem } from "metabase/visualizations/visualizations/PivotTable/types";
import {
  getTopHeaderRowIndex,
  getTopHeaderRowsCount,
} from "metabase/visualizations/visualizations/PivotTable/utils";
import {
  type ComputedVisualizationSettings,
  extractRemappedColumns,
  getComputedSettingsForSeries,
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  getTitleForColumn,
  isPivoted,
} from "metabase/viz-core";
import type {
  Card,
  ColumnSettings,
  DatasetData,
  RawSeries,
  RowValue,
} from "metabase-types/api";

interface ResultsClipboardParams {
  card: Card;
  data: DatasetData;
  pivoted?: boolean;
  // Whether this result came from a pivot query, independent of whether it's
  // currently displayed pivoted (the raw-table toggle keeps this data shape)
  isPivotResult?: boolean;
  isShowingDetailsOnlyColumns?: boolean;
  translate: ContentTranslationFunction;
}

interface ResultsClipboardContent {
  text: string;
  html: string;
  rowCount: number;
  isPivotGrid: boolean;
}

export function getResultsClipboardContent({
  card,
  data,
  pivoted = false,
  isPivotResult = pivoted,
  isShowingDetailsOnlyColumns = false,
  translate,
}: ResultsClipboardParams): ResultsClipboardContent {
  const series: RawSeries = [{ card, data: extractRemappedColumns(data) }];
  const settings = getComputedSettingsForSeries(series);

  if (pivoted && card.display === "pivot") {
    const grid = getPivotGrid(series, settings, translate);
    if (!grid) {
      throw new Error("Could not lay out the pivot table");
    }
    return {
      ...serializeLines(grid.lines),
      rowCount: grid.bodyRowCount,
      isPivotGrid: true,
    };
  }

  const [{ data: remappedData }] = series;
  const flatSeries: RawSeries = [
    {
      card,
      data: isPivotResult
        ? flattenPivotGroupedData(remappedData)
        : remappedData,
    },
  ];
  const visibleData = getVisibleTableData({
    series: flatSeries,
    settings,
    isShowingDetailsOnlyColumns,
    isShowingDisabledColumns: false,
  });
  const { cols, rows } = visibleData;

  // The renderer shows the all-columns-hidden message instead of a grid here
  if (cols.length === 0) {
    throw new Error("All columns are hidden");
  }

  const isClassicPivot = isPivoted(flatSeries, settings);

  const headers = cols.map((col) =>
    String(translate(getTitleForColumn(col, series, settings))),
  );

  // Click row data varies per cell only in classic pivots, so cache it per row
  const rowClickedData = new Map<
    number,
    ReturnType<typeof getTableClickedObjectRowData>
  >();
  const getRowClickedData = (rowIndex: number, columnIndex: number) => {
    if (isClassicPivot) {
      return getTableClickedObjectRowData(
        flatSeries,
        rowIndex,
        columnIndex,
        isClassicPivot,
        visibleData,
      );
    }
    if (!rowClickedData.has(rowIndex)) {
      rowClickedData.set(
        rowIndex,
        getTableClickedObjectRowData(
          flatSeries,
          rowIndex,
          0,
          false,
          visibleData,
        ),
      );
    }
    return rowClickedData.get(rowIndex) ?? null;
  };

  const formatters = cols.map((col, columnIndex) => {
    const columnSettings = settings.column?.(col);
    return createPlainCellFormatter({
      columnSettings,
      translate,
      copyLinkUrl: true,
      getClicked: cellTextNeedsClicked(columnSettings)
        ? (rowIndex) =>
            getTableCellClickedObject(
              visibleData,
              settings,
              rowIndex,
              columnIndex,
              isClassicPivot,
              getRowClickedData(rowIndex, columnIndex),
            )
        : undefined,
    });
  });
  const getCellText = (
    value: RowValue,
    rowIndex: number,
    columnIndex: number,
  ) =>
    formatCellValueForCopy(
      value,
      formatters[columnIndex],
      rowIndex,
      cols[columnIndex].name,
    );

  const lines = [
    headers,
    ...rows.map((row, rowIndex) =>
      row.map((value, columnIndex) =>
        getCellText(value, rowIndex, columnIndex),
      ),
    ),
  ];
  return {
    ...serializeLines(lines),
    rowCount: rows.length,
    isPivotGrid: isClassicPivot,
  };
}

// Only the link branches of formatValue read `clicked` for plain text
function cellTextNeedsClicked(columnSettings?: ColumnSettings): boolean {
  const clickBehavior = columnSettings?.click_behavior;
  const hasClickBehaviorLinkText =
    clickBehavior != null &&
    "linkTextTemplate" in clickBehavior &&
    Boolean(clickBehavior.linkTextTemplate);
  const hasLegacyLink =
    columnSettings?.view_as === "link" &&
    Boolean(columnSettings.link_text || columnSettings.link_url);
  return hasClickBehaviorLinkText || hasLegacyLink;
}

// Spreadsheets evaluate pasted cells that start like formulas; the leading
// quote is their own text-literal marker. Formatted numbers ("-5", "-$1,234.5",
// "-1.5e-11") paste as numbers, never as formulas, so they keep pasting
// unquoted. The trigger set follows OWASP's CSV-injection list, including the
// full-width forms some locales produce.
const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r\n\0＝＋－＠]/;
const NUMERIC_LITERAL_PATTERN =
  /^[+-]?[\p{Sc}\d.,\s]*\d(?:\s*[eE][+-]?\d+)?\s*%?$/u;

function escapeSpreadsheetFormula(text: string): string {
  const isFormulaLike =
    FORMULA_TRIGGER_PATTERN.test(text) && !NUMERIC_LITERAL_PATTERN.test(text);
  return isFormulaLike ? `'${text}` : text;
}

export class ResultsTooLargeError extends Error {
  constructor() {
    super("The serialized results exceed the clipboard size limit");
  }
}

// Enforced by callers before anything materializes: a sparse pivot with 2,000
// unique row and column keys expands to a 2,000×2,000 grid, which costs >2s of
// synchronous work, 36MB of HTML and 900MB of memory.
export const MAX_COPY_CELLS = 1_000_000;

// Raw cell characters, checked after formatting; guards a small grid of huge
// text cells that stays under the cell cap.
const MAX_COPY_TEXT_LENGTH = 20_000_000;

function serializeLines(lines: string[][]) {
  const escapedLines = lines.map((cells) =>
    cells.map(escapeSpreadsheetFormula),
  );
  const textLength = escapedLines.reduce(
    (total, cells) =>
      cells.reduce((lineTotal, cell) => lineTotal + cell.length, total),
    0,
  );
  if (textLength > MAX_COPY_TEXT_LENGTH) {
    throw new ResultsTooLargeError();
  }
  return {
    text: serializeTsv(escapedLines),
    html: serializeHtmlTable(escapedLines),
  };
}

function serializeHtmlTable(lines: string[][]): string {
  const rows = lines
    .map(
      (cells) =>
        `<tr>${cells.map((cell) => `<td>${escapeHtmlCell(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

function escapeHtmlCell(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

// Only top headers and dimension titles are content-translated, as in the rendered grid
function getPivotGrid(
  series: RawSeries,
  settings: ComputedVisualizationSettings,
  translate: ContentTranslationFunction,
): { lines: string[][]; bodyRowCount: number } | null {
  const [{ data }] = series;
  const pivotData = DataGrid.multiLevelPivot(data, settings);
  if (!pivotData) {
    return null;
  }

  const getItemText = (item: Pick<HeaderItem, "value">) => item.value ?? "";

  const {
    topHeaderItems,
    leftHeaderItems,
    rowCount,
    columnCount,
    rowIndexes,
    columnIndexes,
    valueIndexes,
    columnsWithoutPivotGroup,
    getRowSection,
  } = pivotData;

  const topRowCount = getTopHeaderRowsCount(columnIndexes, valueIndexes);
  const leftColumnCount = rowIndexes.length;
  const bodyColumnCount = columnCount * valueIndexes.length;

  const headerLines = Array.from({ length: topRowCount }, () =>
    new Array<string>(leftColumnCount + bodyColumnCount).fill(""),
  );
  for (const item of topHeaderItems) {
    const lineIndex = getTopHeaderRowIndex(item, topRowCount);
    if (headerLines[lineIndex]) {
      headerLines[lineIndex][leftColumnCount + item.offset] = String(
        translate(getItemText(item)),
      );
    }
  }
  // The renderer titles these dimension cells with the pivot-local helper, which
  // never appends the currency unit the generic one does
  rowIndexes.forEach((columnIndex, position) => {
    headerLines[topRowCount - 1][position] = String(
      translate(
        getPivotTitleForColumn(columnsWithoutPivotGroup[columnIndex], settings),
      ),
    );
  });

  const bodyLines: string[][] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const line = new Array<string>(leftColumnCount).fill("");
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      for (const cell of getRowSection(columnIndex, rowIndex)) {
        line.push(getItemText(cell));
      }
    }
    bodyLines.push(line);
  }
  for (const item of leftHeaderItems) {
    if (bodyLines[item.offset]) {
      bodyLines[item.offset][item.depth] = getItemText(item);
    }
  }

  return { lines: [...headerLines, ...bodyLines], bodyRowCount: rowCount };
}

// Pivot results interleave subtotal rows and carry the grouping column
export function flattenPivotGroupedData(data: DatasetData): DatasetData {
  const groupIndex = data.cols.findIndex(DataGrid.isPivotGroupColumn);
  if (groupIndex < 0) {
    return data;
  }
  return {
    ...data,
    cols: data.cols.filter((col) => !DataGrid.isPivotGroupColumn(col)),
    rows: data.rows
      .filter((row) => DataGrid.isPivotDetailRow(row, groupIndex))
      .map((row) => row.filter((_value, index) => index !== groupIndex)),
  };
}
