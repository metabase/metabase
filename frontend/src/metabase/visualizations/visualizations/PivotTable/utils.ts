import { t } from "ttag";
import _ from "underscore";

import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/embedding-sdk/theme";
import { sumArray } from "metabase/lib/arrays";
import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { measureText } from "metabase/lib/measure-text";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { migratePivotColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";
import type {
  ColumnNameColumnSplitSetting,
  DatasetColumn,
  DatasetData,
  PivotTableColumnSplitSetting,
  VisualizationSettings,
} from "metabase-types/api";

import {
  CELL_HEIGHT,
  CELL_PADDING,
  DEFAULT_CELL_WIDTH,
  LEFT_HEADER_LEFT_SPACING,
  MAX_HEADER_CELL_WIDTH,
  MAX_ROWS_TO_MEASURE,
  MIN_HEADER_CELL_WIDTH,
  ROW_TOGGLE_ICON_WIDTH,
} from "./constants";
import { partitions } from "./partitions";
import type { CustomColumnWidth, HeaderItem } from "./types";

// adds or removes columns from the pivot settings based on the current query
export function updateValueWithCurrentColumns(
  storedValue: PivotTableColumnSplitSetting,
  columns: DatasetColumn[],
): PivotTableColumnSplitSetting {
  const migratedValue = migratePivotColumnSplitSetting(storedValue, columns);
  const currentQueryColumnNames = columns.map((c) => c.name);
  const currentSettingColumnNames = Object.values(migratedValue).flatMap(
    (columnNames) => columnNames ?? [],
  );
  const toAdd = _.difference(
    currentQueryColumnNames,
    currentSettingColumnNames,
  );
  const toRemove = _.difference(
    currentSettingColumnNames,
    currentQueryColumnNames,
  );
  // if there are no modifications, it's important to return the original,
  // potentially legacy settings that use field refs. If the migrated settings
  // are returned here it would make all saved legacy questions become ad-hoc,
  // which we should avoid.
  if (toAdd.length === 0 && toRemove.length === 0) {
    return storedValue;
  }

  // remove toRemove
  const value: ColumnNameColumnSplitSetting = _.mapObject(
    migratedValue,
    (columnNames) =>
      columnNames?.filter((columnName) => !toRemove.includes(columnName)),
  );

  // add toAdd to first partitions where it matches the filter
  for (const columnName of toAdd) {
    for (const { columnFilter: filter, name } of partitions) {
      const column = columns.find((c) => c.name === columnName);
      if (column != null && (filter == null || filter(column))) {
        value[name] = value[name] ?? [];
        value[name].push(column.name);
        break;
      }
    }
  }

  return value;
}

// This is a hack. We need to pass pivot_rows and pivot_cols on each query.
// When a breakout is added to the query, we need to partition it before getting the rows.
// We pretend the breakouts are columns so we can partition the new breakout.
export function addMissingCardBreakouts(
  setting: PivotTableColumnSplitSetting,
  availableColumns: DatasetColumn[],
): PivotTableColumnSplitSetting {
  const { rows = [], columns = [] } = setting;
  const breakoutColumns = availableColumns.filter(
    (column) => column.source === "breakout",
  );
  if (breakoutColumns.length <= columns.length + rows.length) {
    return setting;
  }
  return updateValueWithCurrentColumns(setting, availableColumns);
}

export function isColumnValid(col: DatasetColumn) {
  return (
    col.source === "aggregation" ||
    col.source === "breakout" ||
    isPivotGroupColumn(col)
  );
}

export function isFormattablePivotColumn(column: DatasetColumn) {
  return column.source === "aggregation";
}

interface GetLeftHeaderWidthsProps {
  rowIndexes: number[];
  getColumnTitle: (columnIndex: number) => string;
  leftHeaderItems?: HeaderItem[];
  font: { fontFamily?: string; fontSize?: string };
}

export function getLeftHeaderWidths({
  rowIndexes,
  getColumnTitle,
  leftHeaderItems = [],
  font,
}: GetLeftHeaderWidthsProps) {
  const {
    fontFamily = "var(--mb-default-font-family)",
    fontSize = DEFAULT_METABASE_COMPONENT_THEME.pivotTable.cell.fontSize,
  } = font ?? {};

  const cellValues = getColumnValues(leftHeaderItems);

  const widths = rowIndexes.map((rowIndex, depthIndex) => {
    const computedHeaderWidth = Math.ceil(
      measureText(getColumnTitle(rowIndex), {
        weight: "bold",
        family: fontFamily,
        size: fontSize,
      }).width + ROW_TOGGLE_ICON_WIDTH,
    );

    const computedCellWidth = Math.ceil(
      Math.max(
        // we need to use the depth index because the data is in depth order, not row index order
        ...(cellValues[depthIndex]?.values?.map(
          (value) =>
            measureText(value, {
              weight: "normal",
              family: fontFamily,
              size: fontSize,
            }).width +
            (cellValues[rowIndex]?.hasSubtotal ? ROW_TOGGLE_ICON_WIDTH : 0),
        ) ?? [0]),
      ),
    );

    const computedWidth =
      Math.max(computedHeaderWidth, computedCellWidth) + CELL_PADDING;

    if (computedWidth > MAX_HEADER_CELL_WIDTH) {
      return MAX_HEADER_CELL_WIDTH;
    }

    if (computedWidth < MIN_HEADER_CELL_WIDTH) {
      return MIN_HEADER_CELL_WIDTH;
    }

    return computedWidth;
  });

  const total = sumArray(widths);

  return { leftHeaderWidths: widths, totalLeftHeaderWidths: total };
}

type ColumnValueInfo = {
  values: string[];
  hasSubtotal: boolean;
};

export function getColumnValues(leftHeaderItems: HeaderItem[]) {
  const columnValues: ColumnValueInfo[] = [];

  leftHeaderItems
    .slice(0, MAX_ROWS_TO_MEASURE)
    .forEach((leftHeaderItem: HeaderItem) => {
      const { value, depth, isSubtotal, isGrandTotal, hasSubtotal } =
        leftHeaderItem;

      // don't size based on subtotals or grand totals
      if (!isSubtotal && !isGrandTotal) {
        if (!columnValues[depth]) {
          columnValues[depth] = {
            values: [value],
            hasSubtotal: false,
          };
        } else {
          columnValues[depth].values.push(value);
        }

        // we need to track whether the column has a subtotal to size for the row expand icon
        if (hasSubtotal) {
          columnValues[depth].hasSubtotal = true;
        }
      }
    });

  return columnValues;
}

function databaseSupportsPivotTables(query: NativeQuery | null | undefined) {
  if (!query) {
    return true;
  }

  const question = query.question();
  const database = question.database();

  if (!database) {
    // if we don't have metadata, we can't check this
    return true;
  }

  return database.supportsPivots();
}

export function checkRenderable(
  [{ data }]: [{ data: DatasetData }],
  settings: VisualizationSettings,
  query?: NativeQuery | null,
) {
  if (data.cols.length < 2 || !data.cols.every(isColumnValid)) {
    throw new Error(t`Pivot tables can only be used with aggregated queries.`);
  }
  if (!databaseSupportsPivotTables(query)) {
    throw new Error(t`This database does not support pivot tables.`);
  }
}

export const leftHeaderCellSizeAndPositionGetter = (
  item: HeaderItem,
  leftHeaderWidths: number[],
  rowIndexes: number[],
) => {
  const { offset, span, depth, maxDepthBelow } = item;

  const columnsToSpan = rowIndexes.length - depth - maxDepthBelow;

  // add up all the widths of the columns, other than itself, that this cell spans
  const spanWidth = sumArray(
    leftHeaderWidths.slice(depth + 1, depth + columnsToSpan),
  );
  const columnPadding = depth === 0 ? LEFT_HEADER_LEFT_SPACING : 0;
  const columnWidth = leftHeaderWidths[depth];

  return {
    height: span * CELL_HEIGHT,
    width: columnWidth + spanWidth + columnPadding,
    x:
      sumArray(leftHeaderWidths.slice(0, depth)) +
      (depth > 0 ? LEFT_HEADER_LEFT_SPACING : 0),
    y: offset * CELL_HEIGHT,
  };
};

export const topHeaderCellSizeAndPositionGetter = (
  item: HeaderItem,
  topHeaderRows: number,
  valueHeaderWidths: CustomColumnWidth,
) => {
  const { offset, span, maxDepthBelow } = item;

  const leftOffset = getWidthForRange(valueHeaderWidths, 0, offset);
  const width = getWidthForRange(valueHeaderWidths, offset, offset + span);

  return {
    height: CELL_HEIGHT,
    width,
    x: leftOffset,
    y: (topHeaderRows - maxDepthBelow - 1) * CELL_HEIGHT,
  };
};

export const getWidthForRange = (
  widths: CustomColumnWidth,
  start?: number,
  end?: number,
) => {
  let total = 0;
  for (let i = start ?? 0; i < (end ?? Object.keys(widths).length); i++) {
    total += widths[i] ?? DEFAULT_CELL_WIDTH;
  }
  return total;
};

export const getCellWidthsForSection = (
  valueHeaderWidths: CustomColumnWidth,
  valueIndexes: number[],
  startIndex: number,
) => {
  const widths = [];
  const startCol = startIndex * valueIndexes.length;
  const endCol = startIndex * valueIndexes.length + valueIndexes.length;
  for (let i = startCol; i < endCol; i++) {
    widths.push(valueHeaderWidths[i] ?? DEFAULT_CELL_WIDTH);
  }
  return widths;
};
