import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { ColumnNameColumnSplitSetting } from "metabase-types/api";

import type {
  SummaryDragItem,
  SummaryPivotChange,
  SummaryWellId,
} from "./types";
import {
  canDropOnWell,
  getDimensionItems,
  getResultColumnNames,
  getValueItems,
} from "./utils";

export const NO_PIVOT_LAYOUT: ColumnNameColumnSplitSetting = {
  rows: [],
  columns: [],
  values: [],
};

function sortByOrder(names: string[], order: string[]) {
  return _.sortBy(names, (name) => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  });
}

/**
 * Where the groupings and the values of the summary go in pivot mode. `columnSplit.rows` gives
 * the Rows groupings, and every other grouping goes in Columns. `columnSplit` also gives the order
 * of Columns and of the values, and a column that it doesn't have comes last in its well.
 *
 * Without a grouping in Rows there is no pivot table, and the columns keep the order of the query.
 */
export function getPivotLayout(
  query: Lib.Query,
  stageIndex: number,
  columnSplit: ColumnNameColumnSplitSetting,
): ColumnNameColumnSplitSetting {
  const { breakoutNames, aggregationNames } = getResultColumnNames(
    query,
    stageIndex,
  );
  const rows = columnSplit.rows.filter((name) => breakoutNames.includes(name));
  if (rows.length === 0) {
    return { rows, columns: breakoutNames, values: aggregationNames };
  }
  return {
    rows,
    columns: sortByOrder(
      breakoutNames.filter((name) => !rows.includes(name)),
      columnSplit.columns,
    ),
    values: sortByOrder(aggregationNames, columnSplit.values),
  };
}

function getItems<Item extends { key: string }>(items: Item[], keys: string[]) {
  return keys
    .map((key) => items.find((item) => item.key === key))
    .filter(isNotNull);
}

export function getWellItems(
  query: Lib.Query,
  stageIndex: number,
  layout: ColumnNameColumnSplitSetting,
) {
  const dimensionItems = getDimensionItems(query, stageIndex);
  return {
    valueItems: getItems(getValueItems(query, stageIndex), layout.values),
    columnItems: getItems(dimensionItems, layout.columns),
    rowItems: getItems(dimensionItems, layout.rows),
  };
}

/**
 * The column split of the pivot table that the layout defines, or `null` when it defines none.
 * A pivot table needs a value and a grouping in Rows.
 */
export function getPivotSplit(
  layout: ColumnNameColumnSplitSetting,
): ColumnNameColumnSplitSetting | null {
  return layout.rows.length > 0 && layout.values.length > 0 ? layout : null;
}

export function getPivotChange(
  pivotSplit: ColumnNameColumnSplitSetting | null,
  nextPivotSplit: ColumnNameColumnSplitSetting | null,
): SummaryPivotChange | undefined {
  if (nextPivotSplit) {
    return { type: "show", columnSplit: nextPivotSplit };
  }
  return pivotSplit ? { type: "hide" } : undefined;
}

/**
 * The layout after a drop. A grouping chip that moves between the Columns and Rows wells changes
 * only the layout, not the query, and comes last in its new well. Any other drop gives `layout`
 * itself.
 */
export function getPivotLayoutAfterDrop(
  query: Lib.Query,
  stageIndex: number,
  drag: SummaryDragItem,
  wellId: SummaryWellId,
  layout: ColumnNameColumnSplitSetting,
): ColumnNameColumnSplitSetting {
  if (
    drag.kind !== "dimension" ||
    wellId === "values" ||
    !canDropOnWell(query, stageIndex, drag, wellId)
  ) {
    return layout;
  }
  const { key } = drag.item;
  const rows = layout.rows.filter((rowKey) => rowKey !== key);
  const columns = layout.columns.filter((columnKey) => columnKey !== key);
  return wellId === "rows"
    ? { ...layout, rows: [...rows, key], columns }
    : { ...layout, rows, columns: [...columns, key] };
}
