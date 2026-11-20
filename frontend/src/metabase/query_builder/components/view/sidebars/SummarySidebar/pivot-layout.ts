import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
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
 * Where the groupings and the values of the summary go in pivot mode. `columnSplit` gives the
 * groupings that go in Rows, and the order of the Columns groupings and of the values. A grouping
 * that is not in its rows goes in Columns, and a column that it doesn't have comes last. Without
 * a grouping in Rows there is no pivot table, and the columns keep the order of the query.
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

type SummaryColumn = {
  key: string;
  uuid: string;
};

function getSummaryColumns(
  clauses: (Lib.BreakoutClause | Lib.AggregationClause)[],
  names: string[],
): SummaryColumn[] {
  return clauses.map((clause, index) => ({
    key: names[index],
    uuid: Lib.clauseUuid(clause),
  }));
}

function getGroupingsAndValues(query: Lib.Query, stageIndex: number) {
  const { breakoutNames, aggregationNames } = getResultColumnNames(
    query,
    stageIndex,
  );
  return {
    groupings: getSummaryColumns(
      Lib.breakouts(query, stageIndex),
      breakoutNames,
    ),
    values: getSummaryColumns(
      Lib.aggregations(query, stageIndex),
      aggregationNames,
    ),
  };
}

/**
 * The keys of the columns after a query change, in the order they had. Keys are result column
 * names, which shift when another column of the same name goes away, so columns are matched by
 * the UUIDs of their clauses. A column that is changed in place gets a new UUID, and keeps its
 * position.
 */
function getNextKeys(
  keys: string[],
  columns: SummaryColumn[],
  nextColumns: SummaryColumn[],
  canChangeInPlace: boolean,
): string[] {
  const uuids = new Set(columns.map(({ uuid }) => uuid));
  const isChangedInPlace =
    canChangeInPlace && columns.length === nextColumns.length;

  const getNextKey = (key: string) => {
    const index = columns.findIndex((column) => column.key === key);
    if (index === -1) {
      return undefined;
    }
    const { uuid } = columns[index];
    const sameColumn = nextColumns.find((column) => column.uuid === uuid);
    if (sameColumn) {
      return sameColumn.key;
    }
    const replacement = nextColumns[index];
    return isChangedInPlace && !uuids.has(replacement.uuid)
      ? replacement.key
      : undefined;
  };

  return keys.map(getNextKey).filter(isNotNull);
}

type NextPivotLayoutOpts = {
  query: Lib.Query;
  nextQuery: Lib.Query;
  stageIndex: number;
  layout: ColumnNameColumnSplitSetting;
  /** The well that takes the groupings `nextQuery` adds. */
  addedWellId?: SummaryWellId;
};

/**
 * The layout after `query` becomes `nextQuery`. The groupings and the values that stay keep their
 * well and their order, and the ones that `nextQuery` adds come last in their well.
 */
export function getNextPivotLayout({
  query,
  nextQuery,
  stageIndex,
  layout,
  addedWellId,
}: NextPivotLayoutOpts): ColumnNameColumnSplitSetting {
  if (layout.rows.length === 0 && addedWellId !== "rows") {
    return getPivotLayout(nextQuery, stageIndex, layout);
  }
  const { groupings, values } = getGroupingsAndValues(query, stageIndex);
  const next = getGroupingsAndValues(nextQuery, stageIndex);
  const canChangeInPlace = addedWellId === undefined;
  const getNextGroupingKeys = (keys: string[]) =>
    getNextKeys(keys, groupings, next.groupings, canChangeInPlace);

  const uuids = new Set(groupings.map(({ uuid }) => uuid));
  const addedRowKeys =
    addedWellId === "rows"
      ? next.groupings
          .filter(({ uuid }) => !uuids.has(uuid))
          .map(({ key }) => key)
      : [];

  return getPivotLayout(nextQuery, stageIndex, {
    rows: [...getNextGroupingKeys(layout.rows), ...addedRowKeys],
    columns: getNextGroupingKeys(layout.columns),
    values: getNextKeys(layout.values, values, next.values, canChangeInPlace),
  });
}

/**
 * The layout after a drop. A grouping chip that moves between the Columns and Rows wells changes
 * only the layout, not the query, and comes last in its new well. Returns `layout` itself for any
 * other drop.
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
