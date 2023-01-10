import _ from "underscore";
import { getIn } from "icepick";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { measureText } from "metabase/lib/measure-text";

import type { Column } from "metabase-types/types/Dataset";
import type { Card } from "metabase-types/types/Card";
import type {
  PivotSetting,
  FieldOrAggregationReference,
  LeftHeaderItem,
} from "./types";
import { partitions } from "./partitions";

import {
  ROW_TOGGLE_ICON_WIDTH,
  CELL_PADDING,
  MIN_HEADER_CELL_WIDTH,
  MAX_HEADER_CELL_WIDTH,
  PIVOT_TABLE_FONT_SIZE,
  MAX_ROWS_TO_MEASURE,
} from "./constants";

// adds or removes columns from the pivot settings based on the current query
export function updateValueWithCurrentColumns(
  storedValue: PivotSetting,
  columns: Column[],
) {
  const currentQueryFieldRefs = columns.map(c => JSON.stringify(c.field_ref));
  const currentSettingFieldRefs = Object.values(storedValue).flatMap(
    (fieldRefs: FieldOrAggregationReference[]) =>
      fieldRefs.map((field_ref: FieldOrAggregationReference) =>
        JSON.stringify(field_ref),
      ),
  );
  const toAdd = _.difference(currentQueryFieldRefs, currentSettingFieldRefs);
  const toRemove = _.difference(currentSettingFieldRefs, currentQueryFieldRefs);

  // remove toRemove
  const value = _.mapObject(
    storedValue,
    (fieldRefs: FieldOrAggregationReference[]) =>
      fieldRefs.filter(
        (field_ref: FieldOrAggregationReference) =>
          !toRemove.includes(JSON.stringify(field_ref)),
      ),
  );

  // add toAdd to first partitions where it matches the filter
  for (const fieldRef of toAdd) {
    for (const { columnFilter: filter, name } of partitions) {
      const column = columns.find(
        c => JSON.stringify(c.field_ref) === fieldRef,
      );
      if (filter == null || filter(column)) {
        value[name].push(column?.field_ref as FieldOrAggregationReference);
        break;
      }
    }
  }
  return value;
}

// This is a hack. We need to pass pivot_rows and pivot_cols on each query.
// When a breakout is added to the query, we need to partition it before getting the rows.
// We pretend the breakouts are columns so we can partition the new breakout.
export function addMissingCardBreakouts(setting: PivotSetting, card: Card) {
  const breakouts = getIn(card, ["dataset_query", "query", "breakout"]) || [];
  if (breakouts.length <= setting.columns.length + setting.rows.length) {
    return setting;
  }
  const breakoutFieldRefs = breakouts.map((field_ref: any) => ({ field_ref }));
  const { columns, rows } = updateValueWithCurrentColumns(
    setting,
    breakoutFieldRefs,
  );
  return { ...setting, columns, rows };
}

export function isColumnValid(col: Column) {
  return (
    col.source === "aggregation" ||
    col.source === "breakout" ||
    isPivotGroupColumn(col)
  );
}

export function isFormattablePivotColumn(column: Column) {
  return column.source === "aggregation";
}

interface GetLeftHeaderWidthsProps {
  rowIndexes: number[];
  getColumnTitle: (columnIndex: number) => string;
  leftHeaderItems: LeftHeaderItem[];
  fontFamily?: string;
}

export function getLeftHeaderWidths({
  rowIndexes,
  getColumnTitle,
  leftHeaderItems,
  fontFamily = "Lato",
}: GetLeftHeaderWidthsProps) {
  const cellValues = getColumnValues(leftHeaderItems, rowIndexes);

  const widths = rowIndexes.map((rowIndex, depthIndex) => {
    const computedHeaderWidth = Math.ceil(
      measureText(getColumnTitle(rowIndex), {
        weight: "bold",
        family: fontFamily,
        size: PIVOT_TABLE_FONT_SIZE,
      }) + ROW_TOGGLE_ICON_WIDTH,
    );

    const computedCellWidth = Math.ceil(
      Math.max(
        // we need to use the depth index because the data is in depth order, not row index order
        ...cellValues[depthIndex].values.map(
          value =>
            measureText(value, {
              weight: "normal",
              family: fontFamily,
              size: PIVOT_TABLE_FONT_SIZE,
            }) + (cellValues[rowIndex].hasSubtotal ? ROW_TOGGLE_ICON_WIDTH : 0),
        ),
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

  const total = widths.reduce((acc, width) => acc + width, 0);

  return { leftHeaderWidths: widths, totalHeaderWidths: total };
}

type ColumnValueInfo = {
  values: string[];
  hasSubtotal: boolean;
};

function getColumnValues(
  leftHeaderItems: LeftHeaderItem[],
  rowIndexes: number[],
) {
  const columnValues: ColumnValueInfo[] = [];

  leftHeaderItems
    .slice(0, MAX_ROWS_TO_MEASURE)
    .forEach((leftHeaderItem: LeftHeaderItem) => {
      const { value, depth, isSubtotal, isGrandTotal, hasSubtotal } =
        leftHeaderItem;

      // don't size based on subtotals or grand totals
      if (!isSubtotal && !isGrandTotal && value !== null) {
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
