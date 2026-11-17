import _ from "underscore";

import * as Lib from "metabase-lib";

import type { SummaryWellId } from "./types";
import { getDimensionItems, getResultColumnNames } from "./utils";

export function getRowAndColumnItems(
  query: Lib.Query,
  stageIndex: number,
  rowKeys: string[],
) {
  const [rowItems, columnItems] = _.partition(
    getDimensionItems(query, stageIndex),
    (item) => rowKeys.includes(item.key),
  );
  return { rowItems, columnItems };
}

type Grouping = {
  key: string;
  clause: Lib.BreakoutClause;
};

function getGroupings(query: Lib.Query, stageIndex: number): Grouping[] {
  const { breakoutNames } = getResultColumnNames(query, stageIndex);
  return Lib.breakouts(query, stageIndex).map((clause, index) => ({
    key: breakoutNames[index],
    clause,
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
 * The keys of the Rows groupings after `query` becomes `nextQuery`. Keys are result column names,
 * which shift when another grouping of the same column goes away, so groupings are matched by
 * their clauses. A grouping that is changed in place is a different clause, and stays in the
 * well it was in.
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
  const isChangedInPlace =
    addedWellId === undefined && groupings.length === nextGroupings.length;

  return nextGroupings
    .filter(({ clause }, index) => {
      const sameGrouping = groupings.find((grouping) =>
        Lib.isSameClause(grouping.clause, clause),
      );
      if (sameGrouping) {
        return rowKeys.includes(sameGrouping.key);
      }
      if (isChangedInPlace) {
        return rowKeys.includes(groupings[index].key);
      }
      return addedWellId === "rows";
    })
    .map(({ key }) => key);
}
