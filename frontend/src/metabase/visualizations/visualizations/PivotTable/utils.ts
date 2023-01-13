import _ from "underscore";
import { getIn } from "icepick";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { measureText } from "metabase/lib/measure-text";

import type { Column } from "metabase-types/types/Dataset";
import type { Card } from "metabase-types/types/Card";
import type { PivotSetting, FieldOrAggregationReference } from "./types";
import { partitions } from "./partitions";

import {
  ROW_TOGGLE_ICON_WIDTH,
  CELL_PADDING,
  MIN_HEADER_CELL_WIDTH,
  MAX_HEADER_CELL_WIDTH,
  PIVOT_TABLE_FONT_SIZE,
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
  fontFamily?: string;
}

export function getLeftHeaderWidths({
  rowIndexes,
  getColumnTitle,
  fontFamily = "Lato",
}: GetLeftHeaderWidthsProps) {
  const widths = rowIndexes.map(rowIndex => {
    const computedWidth =
      Math.ceil(
        measureText(getColumnTitle(rowIndex), {
          weight: "bold",
          family: fontFamily,
          size: PIVOT_TABLE_FONT_SIZE,
        }),
      ) +
      ROW_TOGGLE_ICON_WIDTH +
      CELL_PADDING;

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
