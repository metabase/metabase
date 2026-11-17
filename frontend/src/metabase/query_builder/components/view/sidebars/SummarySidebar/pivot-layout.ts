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
} from "./utils";

export function getRowAndColumnItems(
  query: Lib.Query,
  stageIndex: number,
  rowKeys: string[],
) {
  const items = getDimensionItems(query, stageIndex);
  const rowItems = rowKeys
    .map((key) => items.find((item) => item.key === key))
    .filter(isNotNull);
  const columnItems = items.filter((item) => !rowKeys.includes(item.key));
  return { rowItems, columnItems };
}

/**
 * The column split of the pivot table that the wells define, or `null` when they define none.
 * A pivot table needs a value and a grouping in Rows.
 */
export function getPivotSplit(
  query: Lib.Query,
  stageIndex: number,
  rowKeys: string[],
): ColumnNameColumnSplitSetting | null {
  const { breakoutNames, aggregationNames } = getResultColumnNames(
    query,
    stageIndex,
  );
  const rows = rowKeys.filter((key) => breakoutNames.includes(key));
  if (rows.length === 0 || aggregationNames.length === 0) {
    return null;
  }
  return {
    rows,
    columns: breakoutNames.filter((name) => !rows.includes(name)),
    values: aggregationNames,
  };
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

type Grouping = {
  key: string;
  uuid: string;
};

function getGroupings(query: Lib.Query, stageIndex: number): Grouping[] {
  const { breakoutNames } = getResultColumnNames(query, stageIndex);
  return Lib.breakouts(query, stageIndex).map((clause, index) => ({
    key: breakoutNames[index],
    uuid: Lib.clauseUuid(clause),
  }));
}

type NextRowKeysOpts = {
  query: Lib.Query;
  nextQuery: Lib.Query;
  stageIndex: number;
  rowKeys: string[];
  /** The well that takes the groupings `nextQuery` adds. */
  addedWellId?: SummaryWellId;
};

/**
 * The keys of the Rows groupings after `query` becomes `nextQuery`, in the order they had. Keys
 * are result column names, which shift when another grouping of the same column goes away, so
 * groupings are matched by the UUIDs of their clauses. A grouping that is changed in place gets
 * a new UUID, and stays in the well it was in.
 */
export function getNextRowKeys({
  query,
  nextQuery,
  stageIndex,
  rowKeys,
  addedWellId,
}: NextRowKeysOpts): string[] {
  if (rowKeys.length === 0 && addedWellId !== "rows") {
    return rowKeys;
  }
  const groupings = getGroupings(query, stageIndex);
  const nextGroupings = getGroupings(nextQuery, stageIndex);
  const uuids = new Set(groupings.map(({ uuid }) => uuid));
  const isChangedInPlace =
    addedWellId === undefined && groupings.length === nextGroupings.length;

  const getNextKey = (key: string) => {
    const index = groupings.findIndex((grouping) => grouping.key === key);
    if (index === -1) {
      return undefined;
    }
    const { uuid } = groupings[index];
    const sameGrouping = nextGroupings.find(
      (grouping) => grouping.uuid === uuid,
    );
    if (sameGrouping) {
      return sameGrouping.key;
    }
    const replacement = nextGroupings[index];
    return isChangedInPlace && !uuids.has(replacement.uuid)
      ? replacement.key
      : undefined;
  };

  const addedKeys =
    addedWellId === "rows"
      ? nextGroupings
          .filter(({ uuid }) => !uuids.has(uuid))
          .map(({ key }) => key)
      : [];
  return [...rowKeys.map(getNextKey).filter(isNotNull), ...addedKeys];
}

/**
 * The Rows keys after a drop. A grouping chip that moves between the Columns and Rows wells
 * changes only these keys, not the query. Returns `rowKeys` itself for any other drop.
 */
export function getRowKeysAfterDrop(
  query: Lib.Query,
  stageIndex: number,
  drag: SummaryDragItem,
  wellId: SummaryWellId,
  rowKeys: string[],
): string[] {
  if (
    drag.kind !== "dimension" ||
    wellId === "values" ||
    !canDropOnWell(query, stageIndex, drag, wellId)
  ) {
    return rowKeys;
  }
  const { key } = drag.item;
  return wellId === "rows"
    ? [...rowKeys, key]
    : rowKeys.filter((rowKey) => rowKey !== key);
}
