import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type { ColumnNameColumnSplitSetting } from "metabase-types/api";

import { getPivotLayout } from "./pivot-layout";
import type { SummaryWellId } from "./types";
import { getResultColumnNames } from "./utils";

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
 * names, which shift when another column of the same name goes away (`CREATED_AT_2` becomes
 * `CREATED_AT`), so columns are matched by the UUIDs of their clauses.
 *
 * A clause that is changed in place can get a new UUID, so it is then matched by its position.
 * `canChangeInPlace` is false for a change that adds to a well, where the same count can hide a
 * removal and an addition.
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
  addedWellId?: SummaryWellId;
};

/**
 * The layout after `query` becomes `nextQuery`. The groupings and the values that stay keep their
 * well and their order. A grouping that `nextQuery` adds comes last in Rows when `addedWellId` is
 * `rows`, and last in Columns otherwise.
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
